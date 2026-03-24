const router = require('express').Router();
const Payment = require('../models/Payment');
const ActivityLog = require('../models/ActivityLog');
const { auth, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/', auth, upload.single('proof'), async (req, res) => {
  const { leadId, amount } = req.body;
  const proofUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const payment = await Payment.create({
    leadId, amount, proofUrl,
    proofVersions: proofUrl ? [{ url: proofUrl, uploadedBy: req.user._id, version: 1 }] : [],
  });
  await ActivityLog.create({ leadId, action: 'payment_created', performedBy: req.user._id, details: { amount } });
  res.status(201).json(payment);
});

router.patch('/:id/upload-proof', auth, upload.single('proof'), async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  const proofUrl = `/uploads/${req.file.filename}`;
  payment.currentVersion += 1;
  payment.proofUrl = proofUrl;
  payment.proofVersions.push({ url: proofUrl, uploadedBy: req.user._id, version: payment.currentVersion });
  payment.verificationStatus = 'pending';
  await payment.save();
  await ActivityLog.create({ leadId: payment.leadId, action: 'payment_proof_uploaded', performedBy: req.user._id, details: { version: payment.currentVersion } });
  res.json(payment);
});

router.patch('/:id/verify', auth, authorize('admin', 'counsellor'), async (req, res) => {
  const { status, rejectionReason } = req.body;
  const update = { verificationStatus: status, verifiedBy: req.user._id, verifiedAt: new Date() };
  if (status === 'rejected') update.rejectionReason = rejectionReason;
  const payment = await Payment.findByIdAndUpdate(req.params.id, update, { new: true });
  await ActivityLog.create({ leadId: payment.leadId, action: `payment_${status}`, performedBy: req.user._id, details: { rejectionReason } });
  res.json(payment);
});

router.get('/lead/:leadId', auth, async (req, res) => {
  const payments = await Payment.find({ leadId: req.params.leadId }).populate('verifiedBy', 'name').sort('-createdAt');
  res.json(payments);
});

module.exports = router;
