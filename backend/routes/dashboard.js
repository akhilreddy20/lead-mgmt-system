const router = require('express').Router();
const Lead = require('../models/Lead');
const FollowUp = require('../models/FollowUp');
const { auth } = require('../middleware/auth');

router.get('/stats', auth, async (req, res) => {
  const [total, newLeads, converted, lost, overdueFollowUps] = await Promise.all([
    Lead.countDocuments(),
    Lead.countDocuments({ status: 'new' }),
    Lead.countDocuments({ status: 'converted' }),
    Lead.countDocuments({ status: 'lost' }),
    FollowUp.countDocuments({ status: 'overdue' }),
  ]);
  const bySource = await Lead.aggregate([{ $group: { _id: '$source', count: { $sum: 1 } } }]);
  const byStatus = await Lead.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  res.json({ total, newLeads, converted, lost, overdueFollowUps, bySource, byStatus });
});

module.exports = router;
