const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, unique: true },
  name: { type: String, required: true },
  email: String,
  phone: { type: String, required: true },
  course: String,
  city: String,
  enrollmentDate: { type: Date, default: Date.now },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  counsellor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
