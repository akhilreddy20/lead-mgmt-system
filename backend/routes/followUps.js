const router = require('express').Router();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');
const Lead = require('../models/Lead');
const ActivityLog = require('../models/ActivityLog');
const { auth } = require('../middleware/auth');
const { canAccessLead, loadLead } = require('../middleware/leadAccess');

router.post('/', auth, loadLead({ from: 'body' }), async (req, res) => {
  const scheduledDate = new Date(req.body.scheduledDate);
  if (Number.isNaN(scheduledDate.getTime())) return res.status(400).json({ error: 'scheduledDate must be a valid date' });

  const followUp = await FollowUp.create({ leadId: req.lead._id, scheduledDate, notes: req.body.notes, createdBy: req.user._id });
  await Lead.updateOne({ _id: req.lead._id }, { $set: { nextFollowUp: scheduledDate }, $inc: { version: 1 } });
  await ActivityLog.create({ leadId: req.lead._id, action: 'follow_up_created', performedBy: req.user._id, details: { scheduledDate } });
  res.status(201).json(followUp);
});

router.get('/', auth, async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.leadId && mongoose.isValidObjectId(req.query.leadId)) filter.leadId = req.query.leadId;

  // Non-admins only see follow-ups for leads they can access.
  if (req.user.role !== 'admin') {
    const mine = await Lead.find({ $or: [{ assignedTo: req.user._id }, { 'escalation.escalatedTo': req.user._id }] }).distinct('_id');
    filter.leadId = filter.leadId
      ? { $in: mine.filter((id) => String(id) === String(filter.leadId)) }
      : { $in: mine };
  }

  // Mark overdue (scoped to the same filter rather than the whole collection)
  await FollowUp.updateMany({ ...filter, status: 'pending', scheduledDate: { $lt: new Date() } }, { status: 'overdue' });
  const followUps = await FollowUp.find(filter).populate('leadId', 'name phone status').populate('createdBy', 'name').sort('scheduledDate');
  res.json(followUps);
});

router.patch('/:id/complete', auth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const existing = await FollowUp.findById(req.params.id);
  const lead = existing && (await Lead.findById(existing.leadId));
  if (!existing || !canAccessLead(req.user, lead)) return res.status(404).json({ error: 'Follow-up not found' });

  const followUp = await FollowUp.findOneAndUpdate(
    { _id: existing._id, status: { $ne: 'completed' } },
    { status: 'completed', completedDate: new Date(), notes: req.body.notes },
    { new: true }
  );
  if (!followUp) return res.status(409).json({ error: 'Follow-up already completed' });
  await ActivityLog.create({ leadId: followUp.leadId, action: 'follow_up_completed', performedBy: req.user._id });
  res.json(followUp);
});

module.exports = router;
