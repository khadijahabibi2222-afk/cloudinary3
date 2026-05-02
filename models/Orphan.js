const mongoose = require('mongoose');

const OrphanSchema = new mongoose.Schema({
  // ── Identity ────────────────────────────────────────────────
  id:             { type: String, required: true, unique: true },
  name:           { type: String, trim: true },
  nameEn:         { type: String, trim: true },
  age:            { type: Number, min: 0, max: 120 },
  gender:         { type: String, default: '' },
  dob:            String,
  tazkira:        String,

  // ── Family ──────────────────────────────────────────────────
  father:         { type: String, trim: true },
  fatherEn:       { type: String, trim: true },
  grandfather:    { type: String, trim: true },
  mother:         { type: String, trim: true },
  motherFather:   { type: String, trim: true },
  family:         Number,
  guardian:       { type: String, trim: true },
  guardianFather: { type: String, trim: true },

  // ── Status ──────────────────────────────────────────────────
  status:         { type: String, enum: ['Healthy','Disabled','Chronic'], default: 'Healthy' },
  isActive:       { type: Boolean, default: true },
  studenttype:    { type: String, enum: ['orphan','needy'], default: 'orphan' },
  priority:       { type: String, enum: ['very_worthy','worthy','average',''], default: '' },

  // ── Education ───────────────────────────────────────────────
  goesSchool:     { type: Boolean, default: true },
  schoolType:     String,
  schoolCustom:   String,
  school:         String,
  grade:          String,
  edutype:        { type: String, enum: ['School','Course','Both',''], default: '' },
  coursegrade:    String,
  studytime:      String,

  // ── Contact ─────────────────────────────────────────────────
  mobile:         String,
  address:        String,
  notes:          String,

  // ── Photo (split: thumb inline, full excluded by default) ───
  photo:          mongoose.Schema.Types.Mixed,
  photoFull:      { type: String, select: false },

  // ── Attachments (metadata only) ─────────────────────────────
  attachments:    { type: Array, default: [] },

  // ── Audit ───────────────────────────────────────────────────
  createdAt:      { type: Date, default: Date.now },
  updatedAt:      { type: Date, default: Date.now },

}, { strict: true, versionKey: false, id: false });

// ════════════════════════════════════════════════════════════
// INDEXES
// ════════════════════════════════════════════════════════════

// Single-field — common filter fields
OrphanSchema.index({ isActive:    1 });
OrphanSchema.index({ status:      1 });
OrphanSchema.index({ studenttype: 1 });
OrphanSchema.index({ school:      1 });
OrphanSchema.index({ grade:       1 });
OrphanSchema.index({ edutype:     1 });
OrphanSchema.index({ age:         1 });
OrphanSchema.index({ father:      1 });
OrphanSchema.index({ grandfather: 1 });
OrphanSchema.index({ priority:    1 });

// Compound — most-used multi-field queries
OrphanSchema.index({ isActive: 1, studenttype: 1 });
OrphanSchema.index({ isActive: 1, status:      1 });
OrphanSchema.index({ isActive: 1, priority:    1 });
OrphanSchema.index({ isActive: 1, school: 1, grade: 1 });
OrphanSchema.index({ father:   1, grandfather: 1 });
OrphanSchema.index({ school:   1, edutype:     1 });
OrphanSchema.index({ updatedAt: -1, isActive:  1 });

// Text search — weighted for relevance
OrphanSchema.index(
  { name: 'text', nameEn: 'text', father: 'text', grandfather: 'text' },
  { weights: { name: 10, nameEn: 5, father: 3, grandfather: 2 }, name: 'orphan_text' }
);

// ════════════════════════════════════════════════════════════
// STATIC PROJECTIONS — use these everywhere instead of ad-hoc objects
// ════════════════════════════════════════════════════════════
OrphanSchema.statics.PROJ = {
  // Default list — all fields except heavy photo blob
  LIST:   { photoFull: 0 },
  // Report queries — no photos, no heavy text fields
  REPORT: { photoFull: 0, photo: 0, attachments: 0, notes: 0, address: 0 },
  // Main table rows — only displayed columns
  TABLE:  { id:1, name:1, nameEn:1, age:1, father:1, grandfather:1,
            guardian:1, status:1, grade:1, school:1, edutype:1,
            studenttype:1, isActive:1, photo:1, updatedAt:1 },
  // Stats/dashboard — counting fields only
  STATS:  { id:1, isActive:1, status:1, studenttype:1, school:1,
            grade:1, edutype:1, goesSchool:1, priority:1 },
};

module.exports = mongoose.model('Orphan', OrphanSchema);
