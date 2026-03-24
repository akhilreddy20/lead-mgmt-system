const router = require('express').Router();
const Lead = require('../models/Lead');
const ActivityLog = require('../models/ActivityLog');
const Student = require('../models/Student');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { roundRobinAssign } = require('../utils/assignLead');

// Create lead (ads/api/manual)
router.post('/', auth, async (req, res) => {
  const lead = new Lead({ ...req.body, status: 'new' });
  // Auto-assign via round-robin
  try {
    const assignee = await roundRobinAssign('telecaller');
    lead.assignedTo = assignee._id;
    lead.assignmentHistory.push({ assignedTo: assignee._id, assignedBy: req.user._id, reason: 'Auto-assigned (round-robin)' });
  } catch (e) { /* no telecaller available, leave unassigned */ }
  await lead.save();
  await ActivityLog.create({ leadId: lead._id, action: 'lead_created', performedBy: req.user._id, details: { source: lead.source } });
  res.status(201).json(lead);
});

// API source (no auth for external integrations, use a simple key check)
router.post('/api-source', async (req, res) => {
  const lead = new Lead({ ...req.body, source: 'api', status: 'new' });
  try {
    const assignee = await roundRobinAssign('telecaller');
    lead.assignedTo = assignee._id;
    lead.assignmentHistory.push({ assignedTo: assignee._id, reason: 'Auto-assigned (round-robin)' });
  } catch (e) {}
  await lead.save();
  res.status(201).json(lead);
});

// List leads
router.get('/', auth, async (req, res) => {
  const { status, assignedTo, source, page = 1, limit = 20, overdue } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (source) filter.source = source;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (overdue === 'true') filter.nextFollowUp = { $lt: new Date() };
  if (req.user.role === 'telecaller') filter.assignedTo = req.user._id;
  if (req.user.role === 'counsellor') filter.assignedTo = req.user._id;
  const leads = await Lead.find(filter).populate('assignedTo', 'name role').sort('-createdAt').skip((page - 1) * limit).limit(Number(limit));
  const total = await Lead.countDocuments(filter);
  res.json({ leads, total, page: Number(page), pages: Math.ceil(total / limit) });
});

// Get single lead
router.get('/:id', auth, async (req, res) => {
  const lead = await Lead.findById(req.params.id).populate('assignedTo', 'name role').populate('assignmentHistory.assignedTo', 'name').populate('assignmentHistory.assignedBy', 'name').populate('notes.addedBy', 'name');
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
});

// Update lead status with optimistic locking
router.patch('/:id/status', auth, async (req, res) => {
  const { status, version, notes } = req.body;
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (lead.isLocked) return res.status(423).json({ error: 'Lead is locked (converted)' });
  if (lead.version !== version) return res.status(409).json({ error: 'Concurrent update detected. Please refresh.' });

  const transitions = Lead.VALID_TRANSITIONS;
  if (!transitions[lead.status]?.includes(status)) {
    return res.status(400).json({ error: `Cannot transition from ${lead.status} to ${status}` });
  }

  const prev = lead.status;
  lead.status = status;
  lead.version += 1;
  if (notes) lead.notes.push({ text: notes, addedBy: req.user._id });
  await lead.save();

  await ActivityLog.create({ leadId: lead._id, action: 'status_changed', performedBy: req.user._id, previousValue: prev, newValue: status });
  res.json(lead);
});

// Add notes
router.post('/:id/notes', auth, async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  lead.notes.push({ text: req.body.text, addedBy: req.user._id });
  lead.version += 1;
  await lead.save();
  await ActivityLog.create({ leadId: lead._id, action: 'note_added', performedBy: req.user._id, details: { text: req.body.text } });
  res.json(lead);
});

// Reassign lead
router.patch('/:id/assign', auth, authorize('admin', 'counsellor'), async (req, res) => {
  const { assignTo, reason } = req.body;
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (lead.isLocked) return res.status(423).json({ error: 'Lead is locked' });

  const prevAssignee = lead.assignedTo;
  lead.assignedTo = assignTo;
  lead.assignmentHistory.push({ assignedTo: assignTo, assignedBy: req.user._id, reason });
  lead.version += 1;
  await lead.save();

  // Update lead counts
  if (prevAssignee) await User.findByIdAndUpdate(prevAssignee, { $inc: { currentLeadCount: -1 } });
  await User.findByIdAndUpdate(assignTo, { $inc: { currentLeadCount: 1 } });

  await ActivityLog.create({ leadId: lead._id, action: 'reassigned', performedBy: req.user._id, previousValue: prevAssignee, newValue: assignTo, details: { reason } });
  res.json(lead);
});

// Escalate to counsellor
router.patch('/:id/escalate', auth, authorize('telecaller', 'admin'), async (req, res) => {
  const { counsellorId, reason } = req.body;
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  lead.escalation = { escalatedTo: counsellorId, escalatedBy: req.user._id, reason, escalatedAt: new Date() };
  lead.assignedTo = counsellorId;
  lead.status = 'escalated';
  lead.assignmentHistory.push({ assignedTo: counsellorId, assignedBy: req.user._id, reason: `Escalated: ${reason}` });
  lead.version += 1;
  await lead.save();

  await ActivityLog.create({ leadId: lead._id, action: 'escalated', performedBy: req.user._id, newValue: counsellorId, details: { reason } });
  res.json(lead);
});

// Set follow-up date
router.patch('/:id/follow-up', auth, async (req, res) => {
  const lead = await Lead.findByIdAndUpdate(req.params.id, { nextFollowUp: req.body.date, version: req.body.version + 1 }, { new: true });
  await ActivityLog.create({ leadId: lead._id, action: 'follow_up_set', performedBy: req.user._id, details: { date: req.body.date } });
  res.json(lead);
});

// Convert lead to student
router.post('/:id/convert', auth, authorize('admin', 'counsellor'), async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (lead.isConverted) return res.status(400).json({ error: 'Already converted' });

  const student = await Student.create({
    leadId: lead._id, name: lead.name, email: lead.email, phone: lead.phone,
    course: lead.course, city: lead.city, counsellor: lead.assignedTo, paymentId: req.body.paymentId,
  });

  lead.isConverted = true;
  lead.isLocked = true;
  lead.status = 'converted';
  lead.version += 1;
  await lead.save();

  await ActivityLog.create({ leadId: lead._id, action: 'converted_to_student', performedBy: req.user._id, details: { studentId: student._id } });
  res.status(201).json({ student, lead });
});

// Activity timeline
router.get('/:id/activity', auth, async (req, res) => {
  const logs = await ActivityLog.find({ leadId: req.params.id }).populate('performedBy', 'name role').sort('-createdAt');
  res.json(logs);
});

module.exports = router;
