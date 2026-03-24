const mongoose = require('mongoose');

const VALID_STATUSES = ['new', 'contacted', 'interested', 'follow_up', 'qualified', 'counsellor_assigned', 'converted', 'lost', 'escalated'];

const VALID_TRANSITIONS = {
  new: ['contacted', 'lost'],
  contacted: ['interested', 'follow_up', 'lost'],
  interested: ['qualified', 'follow_up', 'lost'],
  follow_up: ['contacted', 'interested', 'qualified', 'lost'],
  qualified: ['counsellor_assigned', 'lost'],
  counsellor_assigned: ['converted', 'lost', 'follow_up'],
  escalated: ['counsellor_assigned', 'lost'],
  converted: [],
  lost: [],
};

const leadSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, required: true },
  source: { type: String, enum: ['ads', 'api', 'manual', 'website', 'referral'], required: true },
  status: { type: String, enum: VALID_STATUSES, default: 'new' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignmentHistory: [{
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date, default: Date.now },
    reason: String,
  }],
  escalation: {
    escalatedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    escalatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: String,
    escalatedAt: Date,
  },
  notes: [{ text: String, addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, addedAt: { type: Date, default: Date.now } }],
  nextFollowUp: Date,
  course: String,
  city: String,
  isConverted: { type: Boolean, default: false },
  isLocked: { type: Boolean, default: false },
  version: { type: Number, default: 0 },
}, { timestamps: true });

leadSchema.statics.VALID_TRANSITIONS = VALID_TRANSITIONS;

module.exports = mongoose.model('Lead', leadSchema);
