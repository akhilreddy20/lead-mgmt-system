const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const user = await User.findById(decoded.id).select('-password');
  if (!user) return res.status(401).json({ error: 'User not found' });
  // Deactivated users lose access immediately, even with an unexpired token.
  if (!user.isActive) return res.status(403).json({ error: 'Account is not active' });

  req.user = user;
  return next();
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  return next();
};

module.exports = { auth, authorize };
