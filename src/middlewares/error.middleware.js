'use strict';

const mongoose = require('mongoose');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl.split('?')[0]}`, 'ROUTE_NOT_FOUND'));
}

/** Converts library errors into ApiErrors so every response has the same shape. */
function normalize(err) {
  if (err instanceof ApiError) return err;

  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return ApiError.badRequest('Request body is not valid JSON', 'INVALID_JSON');
  }
  if (err.type === 'entity.too.large') {
    return new ApiError(413, 'Request body is too large', 'PAYLOAD_TOO_LARGE');
  }
  // Duplicate key from a unique index
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'field';
    return ApiError.conflict(`A record with this ${field} already exists`, 'DUPLICATE_KEY', { field });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return ApiError.unprocessable('Validation failed', 'VALIDATION_ERROR', details);
  }
  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for ${err.path}`, 'INVALID_ID');
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const apiError = normalize(err);

  if (!apiError) {
    // Unexpected failure: log server-side (without tokens or OTPs), hide internals from the client.
    console.error(`[error] ${req.method} ${req.originalUrl.split('?')[0]}:`, err && err.stack ? err.stack : err);
    const body = { success: false, message: 'Internal server error', error: { code: 'INTERNAL_SERVER_ERROR' } };
    if (!config.isProduction && !config.isTest) body.error.debug = err && err.message;
    return res.status(500).json(body);
  }

  const body = { success: false, message: apiError.message, error: { code: apiError.code } };
  if (apiError.details !== undefined) body.error.details = apiError.details;
  return res.status(apiError.statusCode).json(body);
}

module.exports = { notFoundHandler, errorHandler };
