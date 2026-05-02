const mongoose = require('mongoose');
const SponsorSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  name:      String,
  phone:     String,
  email:     String,
  type:      String,
  address:   String,
  notes:     String,
  orphanIds: { type: Array, default: [] },
  docs:      { type: Array, default: [] },
}, { strict: false, timestamps: true });
module.exports = mongoose.model('Sponsor', SponsorSchema);
