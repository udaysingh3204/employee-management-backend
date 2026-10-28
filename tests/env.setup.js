'use strict';

// Runs before any test module loads, so src/config/env.js sees these values.
// dotenv never overrides variables that are already set.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_only_secret_0123456789abcdef0123456789abcdef';
process.env.JWT_EXPIRES_IN = '1h';
process.env.HARDCODED_OTP = '123456';
process.env.OTP_TTL_MINUTES = '5';
process.env.OTP_MAX_ATTEMPTS = '3';
process.env.OTP_LOCK_MINUTES = '15';
process.env.ADMIN_EMAILS = 'admin@test.com';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
