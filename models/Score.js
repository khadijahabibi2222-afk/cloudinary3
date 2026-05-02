const mongoose = require('mongoose');
// Store all scores as a single document per app instance (bulk replace)
const ScoreSchema = new mongoose.Schema({
  key:  { type: String, default: 'scores', unique: true },
  data: { type: Array, default: [] },
}, { timestamps: true });
module.exports = mongoose.model('Score', ScoreSchema);
