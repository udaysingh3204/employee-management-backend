'use strict';

const crypto = require('crypto');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * OTP provider abstraction.
 *
 * DEVELOPMENT / TESTING ONLY: the "hardcoded" provider accepts a fixed code from HARDCODED_OTP.
 * It is NOT production-ready authentication. To go live, implement a provider with the same
 * two methods (issue / verify) that generates a random, expiring, single-use code, stores a
 * hash of it, and delivers it through a trusted email/SMS service. env.js refuses to start in
 * production while HARDCODED_OTP is set.
 */
const hardcodedProvider = {
  name: 'hardcoded',
  async issue() {
    // Nothing is sent. The client must already know the development OTP.
    return { delivered: false };
  },
  async verify(_email, otp) {
    const expected = Buffer.from(config.otp.hardcoded);
    const received = Buffer.from(String(otp));
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  },
};

function getProvider() {
  if (config.otp.hardcoded) return hardcodedProvider;
  throw ApiError.unavailable(
    'No OTP delivery provider is configured on this server',
    'OTP_PROVIDER_NOT_CONFIGURED'
  );
}

async function issueOtp(email) {
  return getProvider().issue(email);
}

async function verifyOtp(email, otp) {
  return getProvider().verify(email, otp);
}

function providerName() {
  return config.otp.hardcoded ? hardcodedProvider.name : 'none';
}

module.exports = { issueOtp, verifyOtp, providerName };
