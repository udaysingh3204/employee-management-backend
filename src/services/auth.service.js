'use strict';

const config = require('../config/env');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');
const ApiError = require('../utils/ApiError');
const { generateToken } = require('../utils/generateToken');
const otpService = require('./otp.service');

const { ROLES } = User;
const minutes = (n) => n * 60 * 1000;

/**
 * Role is decided by the server, never by the request body.
 * Emails listed in ADMIN_EMAILS become admins on signup; everyone else is a "user".
 */
function roleForEmail(email) {
  return config.adminEmails.includes(email) ? ROLES.ADMIN : ROLES.USER;
}

async function signup({ email, name }) {
  const existing = await User.findOne({ email });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists', 'USER_ALREADY_EXISTS');
  }
  try {
    const user = await User.create({ email, name, role: roleForEmail(email) });
    return user;
  } catch (err) {
    if (err && err.code === 11000) {
      throw ApiError.conflict('An account with this email already exists', 'USER_ALREADY_EXISTS');
    }
    throw err;
  }
}

async function findEligibleUser(email) {
  const user = await User.findOne({ email }).select('+otpRequestedAt +otpFailedAttempts +otpLockedUntil');
  if (!user) {
    throw ApiError.notFound('No account found for this email. Please sign up first.', 'USER_NOT_FOUND');
  }
  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated', 'ACCOUNT_DISABLED');
  }
  if (user.otpLockedUntil && user.otpLockedUntil > new Date()) {
    throw ApiError.tooMany(
      'Too many invalid OTP attempts. Please try again later.',
      'OTP_LOCKED'
    );
  }
  return user;
}

async function requestLoginOtp({ email }) {
  const user = await findEligibleUser(email);
  await otpService.issueOtp(email);

  user.otpRequestedAt = new Date();
  user.otpFailedAttempts = 0;
  user.otpLockedUntil = undefined;
  await user.save();

  return { email: user.email, expiresInMinutes: config.otp.ttlMinutes };
}

async function verifyOtpAndLogin({ email, otp }) {
  const user = await findEligibleUser(email);

  const requestedAt = user.otpRequestedAt;
  if (!requestedAt || Date.now() - requestedAt.getTime() > minutes(config.otp.ttlMinutes)) {
    throw ApiError.badRequest(
      'No active OTP for this email. Request a new one via /api/auth/login.',
      'OTP_NOT_REQUESTED_OR_EXPIRED'
    );
  }

  const valid = await otpService.verifyOtp(email, otp);
  if (!valid) {
    user.otpFailedAttempts = (user.otpFailedAttempts || 0) + 1;
    const remaining = config.otp.maxAttempts - user.otpFailedAttempts;
    if (remaining <= 0) {
      user.otpLockedUntil = new Date(Date.now() + minutes(config.otp.lockMinutes));
      user.otpRequestedAt = undefined;
      user.otpFailedAttempts = 0;
      await user.save();
      throw ApiError.tooMany('Too many invalid OTP attempts. Please try again later.', 'OTP_LOCKED');
    }
    await user.save();
    const err = ApiError.unauthorized('Invalid OTP', 'INVALID_OTP');
    err.details = { attemptsRemaining: remaining };
    throw err;
  }

  // Success: the OTP request is consumed (single use) and counters reset.
  user.otpRequestedAt = undefined;
  user.otpFailedAttempts = 0;
  user.otpLockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  const { token, expiresAt } = generateToken(user);
  return { token, tokenType: 'Bearer', expiresAt, user: user.toPublicJSON() };
}

async function logout({ userId, jti, expiresAt }) {
  await RevokedToken.updateOne(
    { jti },
    { $setOnInsert: { jti, user: userId, expiresAt } },
    { upsert: true }
  );
}

async function isTokenRevoked(jti) {
  if (!jti) return false;
  const found = await RevokedToken.exists({ jti });
  return Boolean(found);
}

async function getActiveUser(userId) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) return null;
  return user;
}

module.exports = {
  signup,
  requestLoginOtp,
  verifyOtpAndLogin,
  logout,
  isTokenRevoked,
  getActiveUser,
  roleForEmail,
};
