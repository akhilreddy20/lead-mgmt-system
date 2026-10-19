const User = require('../models/User');

/**
 * Least-loaded assignment, done in ONE atomic findOneAndUpdate.
 *
 * The previous version read the user, then incremented in a second query, so
 * two leads created at the same moment could both pick the same telecaller.
 * Ties are broken by _id so the result is deterministic.
 */
async function assignLeastLoaded(role = 'telecaller') {
  const user = await User.findOneAndUpdate(
    { role, isActive: true },
    { $inc: { currentLeadCount: 1 } },
    { sort: { currentLeadCount: 1, _id: 1 }, new: true, projection: '_id name' }
  );
  if (!user) {
    const err = new Error(`No active ${role} available`);
    err.code = 'NO_ASSIGNEE';
    throw err;
  }
  return user;
}

module.exports = { assignLeastLoaded, roundRobinAssign: assignLeastLoaded };
