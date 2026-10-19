const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SELF_SERVICE_ROLES = ['telecaller', 'counsellor'];

const sign = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, isActive: u.isActive });

/**
 * Registration rules (previously anyone could register with role: "admin"):
 *  - The very first account bootstraps the system and becomes an active admin.
 *  - After that, people can sign up as telecaller/counsellor only, and the
 *    account starts INACTIVE until an admin activates it on the Users page.
 */
router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  if (await User.exists({ email: String(email).toLowerCase() })) {
    return res.status(400).json({ error: 'Email exists' });
  }

  const isFirstUser = (await User.estimatedDocumentCount()) === 0;
  let assignedRole = 'telecaller';
  if (isFirstUser) assignedRole = 'admin';
  else if (SELF_SERVICE_ROLES.includes(role)) assignedRole = role;

  const user = await User.create({ name, email, password, role: assignedRole, isActive: isFirstUser });

  if (!user.isActive) {
    return res.status(202).json({ message: 'Account created. An admin must activate it before you can sign in.', user: publicUser(user) });
  }
  return res.status(201).json({ token: sign(user), user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  const user = await User.findOne({ email: String(email).toLowerCase() });
  if (!user || !(await user.comparePassword(password))) return res.status(401).json({ error: 'Invalid credentials' });
  if (!user.isActive) return res.status(403).json({ error: 'Account is not active yet. Ask an admin to activate it.' });
  return res.json({ token: sign(user), user: publicUser(user) });
});

router.get('/me', auth, (req, res) => res.json(publicUser(req.user)));

module.exports = router;
