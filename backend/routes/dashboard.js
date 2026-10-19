const router = require('express').Router();
const Lead = require('../models/Lead');
const FollowUp = require('../models/FollowUp');
const { auth } = require('../middleware/auth');

router.get('/stats', auth, async (req, res) => {
  // Admins see global stats; everyone else sees stats for their own leads.
  const scope = req.user.role === 'admin'
    ? {}
    : { $or: [{ assignedTo: req.user._id }, { 'escalation.escalatedTo': req.user._id }] };
  const leadIds = req.user.role === 'admin' ? null : await Lead.find(scope).distinct('_id');
  const followUpScope = leadIds ? { leadId: { $in: leadIds } } : {};

  const [total, newLeads, converted, lost, overdueFollowUps, bySource, byStatus] = await Promise.all([
    Lead.countDocuments(scope),
    Lead.countDocuments({ ...scope, status: 'new' }),
    Lead.countDocuments({ ...scope, status: 'converted' }),
    Lead.countDocuments({ ...scope, status: 'lost' }),
    FollowUp.countDocuments({ ...followUpScope, status: 'overdue' }),
    Lead.aggregate([{ $match: scope }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
    Lead.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  res.json({ total, newLeads, converted, lost, overdueFollowUps, bySource, byStatus });
});

module.exports = router;
