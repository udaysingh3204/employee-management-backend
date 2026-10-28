'use strict';

/**
 * Loads and validates environment variables once, at startup.
 * The app fails fast (throws) when required configuration is missing or unsafe.
 */
require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

function required(name) {
  const value = process.env[name];
  if (value === undefined || String(value).trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value).trim();
}

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${name} must be an integer`);
  return n;
}

function list(name) {
  return (process.env[name] || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function buildConfig() {
  const jwtSecret = required('JWT_SECRET');
  const hardcodedOtp = (process.env.HARDCODED_OTP || '').trim();

  if (isProduction) {
    if (jwtSecret.length < 32 || /replace_with|changeme|secret/i.test(jwtSecret)) {
      throw new Error('JWT_SECRET is too short or predictable for production (use 32+ random characters)');
    }
    if (hardcodedOtp) {
      throw new Error(
        'Refusing to start: HARDCODED_OTP is set while NODE_ENV=production. ' +
          'The hardcoded OTP is for development/testing only.'
      );
    }
  }

  if (hardcodedOtp && !/^\d{4,8}$/.test(hardcodedOtp)) {
    throw new Error('HARDCODED_OTP must be 4-8 digits');
  }

  const corsOrigins = (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return Object.freeze({
    nodeEnv: NODE_ENV,
    isProduction,
    isTest,
    port: int('PORT', 5000),
    mongoUri: isTest ? process.env.MONGODB_URI_TEST || process.env.MONGODB_URI || '' : required('MONGODB_URI'),
    jwt: Object.freeze({
      secret: jwtSecret,
      expiresIn: (process.env.JWT_EXPIRES_IN || '1h').trim(),
      issuer: 'employee-management-api',
    }),
    otp: Object.freeze({
      hardcoded: hardcodedOtp,
      ttlMinutes: int('OTP_TTL_MINUTES', 5),
      maxAttempts: int('OTP_MAX_ATTEMPTS', 5),
      lockMinutes: int('OTP_LOCK_MINUTES', 15),
    }),
    adminEmails: list('ADMIN_EMAILS'),
    corsOrigins,
    bodyLimit: process.env.BODY_LIMIT || '10kb',
    rateLimit: Object.freeze({
      windowMinutes: int('AUTH_RATE_LIMIT_WINDOW_MINUTES', 15),
      max: int('AUTH_RATE_LIMIT_MAX', isTest ? 10000 : 50),
    }),
    trustProxy: int('TRUST_PROXY', 0),
  });
}

module.exports = buildConfig();
