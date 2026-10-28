'use strict';

const { body, param, query } = require('express-validator');
const { SORTABLE_FIELDS } = require('../services/employee.service');

const PHONE_REGEX = /^\+?[0-9][0-9\s-]{6,18}[0-9]$/;
const EMPLOYEE_ID_REGEX = /^[A-Za-z0-9_-]{2,30}$/;

/** Builds the field rules. `optional` = true for PATCH (partial) updates. */
function fieldRules({ optional }) {
  const req = (field, label = field) => {
    const chain = body(field);
    return optional
      ? chain.optional({ values: 'undefined' }).not().isEmpty().withMessage(`${label} cannot be empty`).bail()
      : chain.exists({ checkNull: true }).withMessage(`${label} is required`).bail();
  };

  const text = (field, max) =>
    req(field)
      .isString()
      .withMessage(`${field} must be a string`)
      .bail()
      .trim()
      .notEmpty()
      .withMessage(`${field} is required`)
      .bail()
      .isLength({ max })
      .withMessage(`${field} must be at most ${max} characters`);

  return [
    req('employeeId')
      .isString()
      .withMessage('employeeId must be a string')
      .bail()
      .trim()
      .matches(EMPLOYEE_ID_REGEX)
      .withMessage('employeeId must be 2-30 characters: letters, numbers, "-" or "_"')
      .customSanitizer((v) => v.toUpperCase()),
    text('employeeName', 100),
    req('email')
      .isString()
      .withMessage('email must be a string')
      .bail()
      .trim()
      .isEmail()
      .withMessage('email must be a valid email address')
      .bail()
      .isLength({ max: 254 })
      .withMessage('email is too long')
      .customSanitizer((v) => v.toLowerCase()),
    req('phoneNumber')
      .isString()
      .withMessage('phoneNumber must be a string')
      .bail()
      .trim()
      .matches(PHONE_REGEX)
      .withMessage('phoneNumber must be 8-20 digits, optionally starting with + and containing spaces or dashes'),
    text('designation', 100),
    text('workLocation', 100),
    body('isActive').optional().isBoolean({ strict: true }).withMessage('isActive must be true or false'),
  ];
}

const idParamRules = [param('id').isMongoId().withMessage('id must be a valid MongoDB ObjectId')];

const createEmployeeRules = fieldRules({ optional: false });
const replaceEmployeeRules = [...idParamRules, ...fieldRules({ optional: false })];
const patchEmployeeRules = [...idParamRules, ...fieldRules({ optional: true })];

const listEmployeesRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  query('isActive').optional().isIn(['true', 'false']).withMessage('isActive must be "true" or "false"'),
  query('designation').optional().isString().isLength({ max: 100 }).withMessage('designation is too long'),
  query('workLocation').optional().isString().isLength({ max: 100 }).withMessage('workLocation is too long'),
  query('search').optional().isString().isLength({ max: 100 }).withMessage('search is too long'),
  query('sortBy')
    .optional()
    .isIn(SORTABLE_FIELDS)
    .withMessage(`sortBy must be one of: ${SORTABLE_FIELDS.join(', ')}`),
  query('order').optional().isIn(['asc', 'desc']).withMessage('order must be "asc" or "desc"'),
];

module.exports = {
  idParamRules,
  createEmployeeRules,
  replaceEmployeeRules,
  patchEmployeeRules,
  listEmployeesRules,
};
