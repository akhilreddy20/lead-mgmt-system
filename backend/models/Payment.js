const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  amount: { type: Number, required: true },
  proofUrl: String,
  proofVersions: [{
    url: String,
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    version: Number,
  }],
  currentVersion: { type: Number, default: 1 },
  verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: Date,
  rejectionReason: String,
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
