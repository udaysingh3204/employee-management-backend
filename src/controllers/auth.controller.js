'use strict';

const { matchedData } = require('express-validator');
const authService = require('../services/auth.service');
const otpService = require('../services/otp.service');
const { sendSuccess } = require('../utils/apiResponse');

async function signup(req, res) {
  const { email, name } = matchedData(req, { locations: ['body'] });
  const user = await authService.signup({ email, name });
  return sendSuccess(res, {
    statusCode: 201,
    message: 'Signup successful. Request an OTP via /api/auth/login to sign in.',
    data: { user: user.toPublicJSON() },
  });
}

async function login(req, res) {
  const { email } = matchedData(req, { locations: ['body'] });
  const result = await authService.requestLoginOtp({ email });
  const isDevOtp = otpService.providerName() === 'hardcoded';
  return sendSuccess(res, {
    message: isDevOtp
      ? 'OTP issued. Verify it via /api/auth/verify-otp (development mode: use the configured development OTP).'
      : 'OTP sent. Verify it via /api/auth/verify-otp.',
    data: { email: result.email, otpExpiresInMinutes: result.expiresInMinutes, nextStep: 'POST /api/auth/verify-otp' },
  });
}

async function verifyOtp(req, res) {
  const { email, otp } = matchedData(req, { locations: ['body'] });
  const result = await authService.verifyOtpAndLogin({ email, otp });
  return sendSuccess(res, { message: 'OTP verified. Login successful.', data: result });
}

async function logout(req, res) {
  await authService.logout({
    userId: req.user.id,
    jti: req.user.jti,
    expiresAt: req.user.tokenExpiresAt,
  });
  return sendSuccess(res, { message: 'Logged out. This token can no longer be used.', data: null });
}

async function me(req, res) {
  const user = await authService.getActiveUser(req.user.id);
  return sendSuccess(res, { message: 'Current user', data: { user: user.toPublicJSON() } });
}

module.exports = { signup, login, verifyOtp, logout, me };
