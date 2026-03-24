const User = require('../models/User');

async function roundRobinAssign(role = 'telecaller') {
  const user = await User.findOne({ role, isActive: true })
    .sort({ currentLeadCount: 1 })
    .select('_id name');
  if (!user) throw new Error(`No active ${role} available`);
  await User.findByIdAndUpdate(user._id, { $inc: { currentLeadCount: 1 } });
  return user;
}

module.exports = { roundRobinAssign };
