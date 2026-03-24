const router = require('express').Router();
const FollowUp = require('../models/FollowUp');
const Lead = require('../models/Lead');
const ActivityLog = require('../models/ActivityLog');
const { auth } = require('../middleware/auth');

router.post('/', auth, async (req, res) => {
  const { leadId, scheduledDate, notes } = req.body;
  const followUp = await FollowUp.create({ leadId, scheduledDate, notes, createdBy: req.user._id });
  await Lead.findByIdAndUpdate(leadId, { nextFollowUp: scheduledDate });
  await ActivityLog.create({ leadId, action: 'follow_up_created', performedBy: req.user._id, details: { scheduledDate } });
  res.status(201).json(followUp);
});

router.get('/', auth, async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.leadId) filter.leadId = req.query.leadId;
  // Mark overdue
  await FollowUp.updateMany({ status: 'pending', scheduledDate: { $lt: new Date() } }, { status: 'overdue' });
  const followUps = await FollowUp.find(filter).populate('leadId', 'name phone status').populate('createdBy', 'name').sort('scheduledDate');
  res.json(followUps);
});

router.patch('/:id/complete', auth, async (req, res) => {
  const followUp = await FollowUp.findByIdAndUpdate(req.params.id, { status: 'completed', completedDate: new Date(), notes: req.body.notes }, { new: true });
  await ActivityLog.create({ leadId: followUp.leadId, action: 'follow_up_completed', performedBy: req.user._id });
  res.json(followUp);
});

module.exports = router;
