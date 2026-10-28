'use strict';

const { Router } = require('express');
const controller = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation.middleware');
const { authLimiter, otpVerifyLimiter } = require('../middlewares/rateLimit.middleware');
const { signupRules, loginRules, verifyOtpRules } = require('../validators/auth.validator');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.use(authLimiter);

router.post('/signup', signupRules, validate, asyncHandler(controller.signup));
router.post('/login', loginRules, validate, asyncHandler(controller.login));
router.post('/verify-otp', otpVerifyLimiter, verifyOtpRules, validate, asyncHandler(controller.verifyOtp));
router.post('/logout', authenticate, asyncHandler(controller.logout));
router.get('/me', authenticate, asyncHandler(controller.me));

module.exports = router;
