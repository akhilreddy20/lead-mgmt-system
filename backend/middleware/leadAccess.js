const Lead = require('../models/Lead');

const sameId = (a, b) => a != null && b != null && String(a._id || a) === String(b._id || b);

/**
 * Object-level authorization (prevents IDOR):
 *  - admin: every lead
 *  - telecaller / counsellor: leads currently assigned to them, or escalated to them
 */
const canAccessLead = (user, lead) => {
  if (!user || !lead) return false;
  if (user.role === 'admin') return true;
  return sameId(lead.assignedTo, user._id) || sameId(lead.escalation?.escalatedTo, user._id);
};

/**
 * Loads the lead named by req.params[param] (or req.body.leadId), enforces
 * access, and exposes it as req.lead. Returns 404 rather than 403 for leads
 * the user can't see, so ids can't be probed.
 */
const loadLead = ({ param = 'id', from = 'params' } = {}) => async (req, res, next) => {
  const id = from === 'body' ? req.body?.leadId : req.params[param];
  if (!id) return res.status(400).json({ error: 'leadId is required' });
  const lead = await Lead.findById(id);
  if (!lead || !canAccessLead(req.user, lead)) return res.status(404).json({ error: 'Lead not found' });
  req.lead = lead;
  return next();
};

module.exports = { canAccessLead, loadLead };
