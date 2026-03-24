const mongoose = require('mongoose');

const followUpSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  scheduledDate: { type: Date, required: true },
  completedDate: Date,
  status: { type: String, enum: ['pending', 'completed', 'overdue'], default: 'pending' },
  notes: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('FollowUp', followUpSchema);
