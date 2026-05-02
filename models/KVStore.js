const mongoose = require('mongoose');
// Generic key-value collection to store arrays (subjects, seasons, graduates, books, bookTx)
const KVSchema = new mongoose.Schema({
  key:  { type: String, required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed, default: [] },
}, { timestamps: true });
module.exports = mongoose.model('KVStore', KVSchema);
