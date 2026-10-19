const mongoose = require('mongoose');

// MONGODB_URI is the documented name (.env.example); MONGO_URI is kept for
// existing deployments that already set it.
const getMongoUri = () => process.env.MONGODB_URI || process.env.MONGO_URI;

const connectDB = async (uri = getMongoUri()) => {
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri);
  console.log(JSON.stringify({ msg: 'MongoDB connected' }));
};

module.exports = connectDB;
module.exports.getMongoUri = getMongoUri;
