const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username: {
    type: String, required: true, unique: true,
    trim: true, lowercase: true,   // always stored lowercase
    minlength: 2, maxlength: 64,
  },
  password: {
    type: String, required: true,
    select: false,                 // never returned in queries by default
  },
  fullName: { type: String, required: true, trim: true, maxlength: 128 },
  role:     { type: String, enum: ['admin','editor','viewer'], default: 'viewer' },
}, { timestamps: true, versionKey: false });

// Hash password before save — only when modified
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt    = await bcrypt.genSalt(12);       // cost factor 12 (secure + fast)
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// comparePassword — always async, always returns boolean
UserSchema.methods.comparePassword = async function (plain) {
  if (!plain || !this.password) return false;
  try {
    return await bcrypt.compare(String(plain), this.password);
  } catch {
    return false;
  }
};

module.exports = mongoose.model('User', UserSchema);
