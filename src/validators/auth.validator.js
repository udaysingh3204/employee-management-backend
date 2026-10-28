'use strict';

const { body } = require('express-validator');

const emailRule = () =>
  body('email')
    .exists({ checkNull: true })
    .withMessage('email is required')
    .bail()
    .isString()
    .withMessage('email must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('email is required')
    .bail()
    .isEmail()
    .withMessage('email must be a valid email address')
    .bail()
    .isLength({ max: 254 })
    .withMessage('email is too long')
    // Lowercase only; keep dots and plus-tags so distinct mailboxes stay distinct.
    .customSanitizer((v) => v.toLowerCase());

const signupRules = [
  emailRule(),
  body('name')
    .optional({ values: 'null' })
    .isString()
    .withMessage('name must be a string')
    .bail()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('name must be 1-100 characters'),
];

const loginRules = [emailRule()];

const verifyOtpRules = [
  emailRule(),
  body('otp')
    .exists({ checkNull: true })
    .withMessage('otp is required')
    .bail()
    .customSanitizer((v) => (typeof v === 'number' ? String(v) : v))
    .isString()
    .withMessage('otp must be a string')
    .bail()
    .trim()
    .matches(/^\d{4,8}$/)
    .withMessage('otp must be 4-8 digits'),
];

module.exports = { signupRules, loginRules, verifyOtpRules };
