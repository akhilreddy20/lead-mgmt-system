const router = require('express').Router();
const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const ActivityLog = require('../models/ActivityLog');
const Payment = require('../models/Payment');
const Student = require('../models/Student');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { loadLead } = require('../middleware/leadAccess');
const { requireApiKey } = require('../utils/apiKey');
const { assignLeastLoaded } = require('../utils/assignLead');
const { pick } = require('../utils/pick');

// Only these fields can come from a client when creating a lead. Everything
// else (status, assignedTo, version, isLocked, isConverted, …) is server-owned.
const CREATABLE_FIELDS = ['name', 'email', 'phone', 'source', 'course', 'city', 'nextFollowUp'];
const CLIENT_SOURCES = ['ads', 'manual', 'website', 'referral'];

/**
 * Atomic optimistic-concurrency update.
 *
 * The filter includes the version the caller last saw, so the read-check-write
 * happens inside MongoDB as one operation. If someone else updated the lead
 * in between, nothing matches and the caller gets 409 instead of silently
 * overwriting their change (the previous findById → compare → save had that race).
 */
async function updateIfVersion(leadId, expectedVersion, update, extraFilter = {}) {
  const updated = await Lead.findOneAndUpdate(
    { _id: leadId, version: expectedVersion, isLocked: false, ...extraFilter },
    { ...update, $inc: { ...(update.$inc || {}), version: 1 } },
    { new: true, runValidators: true }
  );
  if (updated) return { lead: updated };

  const current = await Lead.findById(leadId).select('isLocked version status');
  if (!current) return { status: 404, error: 'Lead not found' };
  if (current.isLocked) return { status: 423, error: 'Lead is locked (converted)' };
  return { status: 409, error: 'Concurrent update detected. Please refresh.' };
}

const sendResult = (res, result) =>
  result.lead ? res.json(result.lead) : res.status(result.status).json({ error: result.error });

async function createLead(data, performedBy) {
  const lead = new Lead({ ...data, status: 'new' });
  try {
    const assignee = await assignLeastLoaded('telecaller');
    lead.assignedTo = assignee._id;
    lead.assignmentHistory.push({ assignedTo: assignee._id, assignedBy: performedBy, reason: 'Auto-assigned (least-loaded)' });
  } catch (err) {
    if (err.code !== 'NO_ASSIGNEE') throw err; // only "nobody available" is expected
  }
  await lead.save();
  if (performedBy) {
    await ActivityLog.create({ leadId: lead._id, action: 'lead_created', performedBy, details: { source: lead.source } });
  }
  return lead;
}

// Create lead (UI)
router.post('/', auth, async (req, res) => {
  const data = pick(req.body, CREATABLE_FIELDS);
  if (data.source && !CLIENT_SOURCES.includes(data.source)) {
    return res.status(400).json({ error: `source must be one of ${CLIENT_SOURCES.join(', ')}` });
  }
  const lead = await createLead({ source: 'manual', ...data }, req.user._id);
  res.status(201).json(lead);
});

// External integrations: authenticated with X-API-Key (LEAD_API_KEY).
router.post('/api-source', requireApiKey, async (req, res) => {
  const lead = await createLead({ ...pick(req.body, CREATABLE_FIELDS), source: 'api' }, null);
  res.status(201).json(lead);
});

// List leads (non-admins only ever see their own)
router.get('/', auth, async (req, res) => {
  const { status, assignedTo, source, overdue } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  const filter = {};
  if (status) filter.status = String(status);
  if (source) filter.source = String(source);
  if (overdue === 'true') filter.nextFollowUp = { $lt: new Date() };
  if (req.user.role === 'admin') {
    if (assignedTo && mongoose.isValidObjectId(assignedTo)) filter.assignedTo = assignedTo;
  } else {
    filter.$or = [{ assignedTo: req.user._id }, { 'escalation.escalatedTo': req.user._id }];
  }

  const [leads, total] = await Promise.all([
    Lead.find(filter).populate('assignedTo', 'name role').sort('-createdAt').skip((page - 1) * limit).limit(limit),
    Lead.countDocuments(filter),
  ]);
  res.json({ leads, total, page, pages: Math.ceil(total / limit) });
});

// Get single lead
router.get('/:id', auth, loadLead(), async (req, res) => {
  const lead = await req.lead.populate([
    { path: 'assignedTo', select: 'name role' },
    { path: 'assignmentHistory.assignedTo', select: 'name' },
    { path: 'assignmentHistory.assignedBy', select: 'name' },
    { path: 'notes.addedBy', select: 'name' },
  ]);
  res.json(lead);
});

// Update status (client must send the version it last saw)
router.patch('/:id/status', auth, loadLead(), async (req, res) => {
  const { status, version, notes } = req.body;
  if (!Number.isInteger(version)) return res.status(400).json({ error: 'version (integer) is required' });

  const lead = req.lead;
  const allowed = Lead.VALID_TRANSITIONS[lead.status] || [];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Cannot transition from ${lead.status} to ${status}` });
  }
  if (status === 'converted') {
    return res.status(400).json({ error: 'Use POST /leads/:id/convert to convert a lead' });
  }

  const update = { $set: { status } };
  if (notes) update.$push = { notes: { text: String(notes), addedBy: req.user._id } };
  const result = await updateIfVersion(lead._id, version, update, { status: lead.status });
  if (result.lead) {
    await ActivityLog.create({ leadId: lead._id, action: 'status_changed', performedBy: req.user._id, previousValue: lead.status, newValue: status });
  }
  sendResult(res, result);
});

// Add note ($push is atomic, so concurrent notes never overwrite each other)
router.post('/:id/notes', auth, loadLead(), async (req, res) => {
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'text is required' });

  const lead = await Lead.findOneAndUpdate(
    { _id: req.lead._id, isLocked: false },
    { $push: { notes: { text, addedBy: req.user._id } }, $inc: { version: 1 } },
    { new: true }
  );
  if (!lead) return res.status(423).json({ error: 'Lead is locked (converted)' });
  await ActivityLog.create({ leadId: lead._id, action: 'note_added', performedBy: req.user._id, details: { text } });
  res.json(lead);
});

// Reassign lead
router.patch('/:id/assign', auth, authorize('admin', 'counsellor'), loadLead(), async (req, res) => {
  const { assignTo, reason } = req.body;
  if (!mongoose.isValidObjectId(assignTo)) return res.status(400).json({ error: 'assignTo must be a user id' });
  const target = await User.findOne({ _id: assignTo, isActive: true });
  if (!target) return res.status(400).json({ error: 'Assignee not found or inactive' });

  const lead = req.lead;
  const prevAssignee = lead.assignedTo;
  const result = await updateIfVersion(lead._id, lead.version, {
    $set: { assignedTo: target._id },
    $push: { assignmentHistory: { assignedTo: target._id, assignedBy: req.user._id, reason } },
  });
  if (!result.lead) return sendResult(res, result);

  if (prevAssignee) await User.updateOne({ _id: prevAssignee, currentLeadCount: { $gt: 0 } }, { $inc: { currentLeadCount: -1 } });
  await User.updateOne({ _id: target._id }, { $inc: { currentLeadCount: 1 } });
  await ActivityLog.create({ leadId: lead._id, action: 'reassigned', performedBy: req.user._id, previousValue: prevAssignee, newValue: target._id, details: { reason } });
  res.json(result.lead);
});

// Escalate to counsellor
router.patch('/:id/escalate', auth, authorize('telecaller', 'admin'), loadLead(), async (req, res) => {
  const { counsellorId, reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'reason is required' });
  if (!mongoose.isValidObjectId(counsellorId)) return res.status(400).json({ error: 'counsellorId must be a user id' });
  const counsellor = await User.findOne({ _id: counsellorId, role: 'counsellor', isActive: true });
  if (!counsellor) return res.status(400).json({ error: 'Counsellor not found or inactive' });

  const lead = req.lead;
  if (['converted', 'lost', 'escalated'].includes(lead.status)) {
    return res.status(400).json({ error: `Cannot escalate a lead that is ${lead.status}` });
  }

  const prevAssignee = lead.assignedTo;
  const result = await updateIfVersion(lead._id, lead.version, {
    $set: {
      status: 'escalated',
      assignedTo: counsellor._id,
      escalation: { escalatedTo: counsellor._id, escalatedBy: req.user._id, reason, escalatedAt: new Date() },
    },
    $push: { assignmentHistory: { assignedTo: counsellor._id, assignedBy: req.user._id, reason: `Escalated: ${reason}` } },
  });
  if (!result.lead) return sendResult(res, result);

  if (prevAssignee) await User.updateOne({ _id: prevAssignee, currentLeadCount: { $gt: 0 } }, { $inc: { currentLeadCount: -1 } });
  await User.updateOne({ _id: counsellor._id }, { $inc: { currentLeadCount: 1 } });
  await ActivityLog.create({ leadId: lead._id, action: 'escalated', performedBy: req.user._id, newValue: counsellor._id, details: { reason } });
  res.json(result.lead);
});

// Set follow-up date
router.patch('/:id/follow-up', auth, loadLead(), async (req, res) => {
  const date = new Date(req.body.date);
  if (Number.isNaN(date.getTime())) return res.status(400).json({ error: 'date must be a valid date' });
  const version = Number.isInteger(req.body.version) ? req.body.version : req.lead.version;
  const result = await updateIfVersion(req.lead._id, version, { $set: { nextFollowUp: date } });
  if (result.lead) {
    await ActivityLog.create({ leadId: req.lead._id, action: 'follow_up_set', performedBy: req.user._id, details: { date } });
  }
  sendResult(res, result);
});

// Convert lead to student
router.post('/:id/convert', auth, authorize('admin', 'counsellor'), loadLead(), async (req, res) => {
  const lead = req.lead;
  if (lead.isConverted) return res.status(400).json({ error: 'Already converted' });
  if (lead.status !== 'counsellor_assigned') {
    return res.status(400).json({ error: 'Only counsellor_assigned leads can be converted' });
  }

  const payment = await Payment.findOne({ _id: req.body.paymentId, leadId: lead._id, verificationStatus: 'verified' });
  if (!payment) return res.status(400).json({ error: 'A verified payment for this lead is required' });

  // Claim the lead atomically first, so two concurrent "convert" clicks can't
  // create two students.
  const claimed = await Lead.findOneAndUpdate(
    { _id: lead._id, isConverted: false, status: 'counsellor_assigned' },
    { $set: { isConverted: true, isLocked: true, status: 'converted' }, $inc: { version: 1 } },
    { new: true }
  );
  if (!claimed) return res.status(409).json({ error: 'Lead was converted or changed concurrently' });

  let student;
  try {
    student = await Student.create({
      leadId: lead._id, name: lead.name, email: lead.email, phone: lead.phone,
      course: lead.course, city: lead.city, counsellor: lead.assignedTo, paymentId: payment._id,
    });
  } catch (err) {
    // Compensate: release the lead so the conversion can be retried.
    await Lead.updateOne({ _id: lead._id }, { $set: { isConverted: false, isLocked: false, status: 'counsellor_assigned' }, $inc: { version: 1 } });
    throw err;
  }

  await ActivityLog.create({ leadId: lead._id, action: 'converted_to_student', performedBy: req.user._id, details: { studentId: student._id } });
  res.status(201).json({ student, lead: claimed });
});

// Activity timeline
router.get('/:id/activity', auth, loadLead(), async (req, res) => {
  const logs = await ActivityLog.find({ leadId: req.lead._id }).populate('performedBy', 'name role').sort('-createdAt');
  res.json(logs);
});

module.exports = router;
module.exports.updateIfVersion = updateIfVersion;
