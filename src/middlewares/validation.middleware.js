'use strict';

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/** Collects express-validator results and fails with 422 + field details. */
function validate(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array({ onlyFirstError: true }).map((e) => ({
    field: e.path,
    location: e.location,
    message: e.msg,
  }));

  // A malformed :id is a bad request (400), not a semantic validation failure.
  if (details.every((d) => d.location === 'params')) {
    return next(ApiError.badRequest('Invalid request parameters', 'INVALID_PARAMS', details));
  }
  return next(ApiError.unprocessable('Validation failed', 'VALIDATION_ERROR', details));
}

module.exports = { validate };
