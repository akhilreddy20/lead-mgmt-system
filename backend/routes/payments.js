const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Lead = require('../models/Lead');
const ActivityLog = require('../models/ActivityLog');
const { auth, authorize } = require('../middleware/auth');
const { canAccessLead, loadLead } = require('../middleware/leadAccess');
const upload = require('../middleware/upload');

const { UPLOAD_DIR, ALLOWED } = upload;

// Proofs are referenced by an authenticated API path, never a public file URL.
const proofPath = (paymentId) => `/api/payments/${paymentId}/proof`;
// Records created before this change only have the legacy public proofUrl.
const currentProofFile = (p) => p.proofFile || (p.proofUrl ? path.basename(p.proofUrl) : null);
const toResponse = (p) => {
  const obj = p.toObject();
  delete obj.proofFile;
  obj.proofUrl = currentProofFile(p) ? proofPath(p._id) : null;
  // eslint-disable-next-line no-unused-vars
  obj.proofVersions = (obj.proofVersions || []).map(({ file, url, ...v }) => v);
  return obj;
};

const loadPayment = async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const payment = await Payment.findById(req.params.id);
  const lead = payment && (await Lead.findById(payment.leadId));
  if (!payment || !canAccessLead(req.user, lead)) return res.status(404).json({ error: 'Payment not found' });
  req.payment = payment;
  req.lead = lead;
  return next();
};

router.post('/', auth, upload.single('proof'), loadLead({ from: 'body' }), async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'amount must be a positive number' });
  if (req.lead.isLocked) return res.status(423).json({ error: 'Lead is locked (converted)' });

  const file = req.file?.filename;
  const payment = await Payment.create({
    leadId: req.lead._id,
    amount,
    proofFile: file,
    proofVersions: file ? [{ file, uploadedBy: req.user._id, version: 1 }] : [],
  });
  await ActivityLog.create({ leadId: req.lead._id, action: 'payment_created', performedBy: req.user._id, details: { amount } });
  res.status(201).json(toResponse(payment));
});

router.patch('/:id/upload-proof', auth, upload.single('proof'), loadPayment, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'proof file is required' });
  if (req.payment.verificationStatus === 'verified') return res.status(400).json({ error: 'Payment is already verified' });

  const payment = await Payment.findByIdAndUpdate(
    req.payment._id,
    {
      $set: { proofFile: req.file.filename, verificationStatus: 'pending' },
      $inc: { currentVersion: 1 },
      $push: { proofVersions: { file: req.file.filename, uploadedBy: req.user._id, version: req.payment.currentVersion + 1 } },
    },
    { new: true }
  );
  await ActivityLog.create({ leadId: payment.leadId, action: 'payment_proof_uploaded', performedBy: req.user._id, details: { version: payment.currentVersion } });
  res.json(toResponse(payment));
});

// Authenticated download of the current proof
router.get('/:id/proof', auth, loadPayment, async (req, res) => {
  const file = currentProofFile(req.payment);
  if (!file) return res.status(404).json({ error: 'No proof uploaded' });
  const full = path.join(UPLOAD_DIR, path.basename(file));
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Proof file missing' });
  res.set('Content-Type', ALLOWED[path.extname(full).toLowerCase()] || 'application/octet-stream');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(full);
});

router.patch('/:id/verify', auth, authorize('admin', 'counsellor'), loadPayment, async (req, res) => {
  const { status, rejectionReason } = req.body;
  if (!['verified', 'rejected'].includes(status)) return res.status(400).json({ error: 'status must be verified or rejected' });
  if (status === 'rejected' && !rejectionReason) return res.status(400).json({ error: 'rejectionReason is required' });

  // Only a pending payment can be decided, and only once (atomic).
  const update = { verificationStatus: status, verifiedBy: req.user._id, verifiedAt: new Date() };
  if (status === 'rejected') update.rejectionReason = rejectionReason;
  const payment = await Payment.findOneAndUpdate({ _id: req.payment._id, verificationStatus: 'pending' }, update, { new: true });
  if (!payment) return res.status(409).json({ error: 'Payment was already processed' });

  await ActivityLog.create({ leadId: payment.leadId, action: `payment_${status}`, performedBy: req.user._id, details: { rejectionReason } });
  res.json(toResponse(payment));
});

router.get('/lead/:leadId', auth, loadLead({ param: 'leadId' }), async (req, res) => {
  const payments = await Payment.find({ leadId: req.lead._id }).populate('verifiedBy', 'name').sort('-createdAt');
  res.json(payments.map(toResponse));
});

module.exports = router;
