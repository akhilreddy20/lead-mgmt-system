const router = require('express').Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');

router.get('/', auth, authorize('admin'), async (req, res) => {
  const { role } = req.query;
  const filter = role ? { role: String(role) } : {};
  const users = await User.find(filter).select('-password').sort('name');
  res.json(users);
});

// Minimal directory so telecallers can pick a counsellor when escalating
// (they previously got an empty list because /users is admin-only).
router.get('/counsellors', auth, async (req, res) => {
  const counsellors = await User.find({ role: 'counsellor', isActive: true }).select('_id name role').sort('name');
  res.json(counsellors);
});

router.patch('/:id/active', auth, authorize('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  if (typeof req.body.isActive !== 'boolean') return res.status(400).json({ error: 'isActive must be a boolean' });
  if (String(req.params.id) === String(req.user._id) && req.body.isActive === false) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }
  const user = await User.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true }).select('-password');
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
