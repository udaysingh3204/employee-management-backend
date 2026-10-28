'use strict';

const { rateLimit } = require('express-rate-limit');
const config = require('../config/env');

function limiter({ windowMinutes, max, code, message }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ success: false, message, error: { code } }),
  });
}

/** Applied to every /api/auth route. */
const authLimiter = limiter({
  windowMinutes: config.rateLimit.windowMinutes,
  max: config.rateLimit.max,
  code: 'TOO_MANY_REQUESTS',
  message: 'Too many authentication requests, please try again later',
});

/** Stricter limit for OTP verification on top of the per-account lockout. */
const otpVerifyLimiter = limiter({
  windowMinutes: config.rateLimit.windowMinutes,
  max: Math.max(5, Math.floor(config.rateLimit.max / 2)),
  code: 'TOO_MANY_OTP_ATTEMPTS',
  message: 'Too many OTP verification attempts, please try again later',
});

module.exports = { authLimiter, otpVerifyLimiter };
