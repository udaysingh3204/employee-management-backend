'use strict';

const mongoose = require('mongoose');

const ROLES = Object.freeze({ ADMIN: 'admin', USER: 'user' });

/**
 * Authentication identity. Kept separate from Employee records.
 * No password is stored because login is OTP-based.
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: { type: String, trim: true, maxlength: 100 },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.USER },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    // OTP bookkeeping (never returned to clients)
    otpRequestedAt: { type: Date, select: false },
    otpFailedAttempts: { type: Number, default: 0, select: false },
    otpLockedUntil: { type: Date, select: false },
  },
  { timestamps: true, versionKey: false }
);

userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: String(this._id),
    email: this.email,
    name: this.name || null,
    role: this.role,
    isActive: this.isActive,
    lastLoginAt: this.lastLoginAt || null,
    createdAt: this.createdAt,
  };
};

const User = mongoose.model('User', userSchema);

module.exports = User;
module.exports.ROLES = ROLES;
