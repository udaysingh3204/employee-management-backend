'use strict';

/**
 * Operational error with an HTTP status and a stable machine-readable code.
 * Anything thrown that is NOT an ApiError is treated as an unexpected 500.
 */
class ApiError extends Error {
  constructor(statusCode, message, code = 'ERROR', details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }

  static badRequest(message, code = 'BAD_REQUEST', details) {
    return new ApiError(400, message, code, details);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new ApiError(401, message, code);
  }

  static forbidden(message = 'You do not have permission to perform this action', code = 'FORBIDDEN') {
    return new ApiError(403, message, code);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, message, code);
  }

  static conflict(message, code = 'CONFLICT', details) {
    return new ApiError(409, message, code, details);
  }

  static unprocessable(message = 'Validation failed', code = 'VALIDATION_ERROR', details) {
    return new ApiError(422, message, code, details);
  }

  static tooMany(message = 'Too many requests, please try again later', code = 'TOO_MANY_REQUESTS') {
    return new ApiError(429, message, code);
  }

  static unavailable(message = 'Service unavailable', code = 'SERVICE_UNAVAILABLE') {
    return new ApiError(503, message, code);
  }
}

module.exports = ApiError;
