'use strict';

const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const { verifyToken } = require('../utils/generateToken');
const authService = require('../services/auth.service');

/**
 * Requires "Authorization: Bearer <token>".
 * Identity comes ONLY from the verified token; ids or roles in the body are never trusted.
 * On success sets req.user = { id, role, jti, tokenExpiresAt }.
 */
async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token, extra] = header.split(' ');
    if (!header) throw ApiError.unauthorized('Authentication token is missing', 'TOKEN_MISSING');
    if (scheme !== 'Bearer' || !token || extra) {
      throw ApiError.unauthorized('Authorization header must be in the format: Bearer <token>', 'TOKEN_MALFORMED');
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw ApiError.unauthorized('Authentication token has expired', 'TOKEN_EXPIRED');
      }
      throw ApiError.unauthorized('Authentication token is invalid', 'TOKEN_INVALID');
    }

    if (!payload.sub || !payload.role) {
      throw ApiError.unauthorized('Authentication token is invalid', 'TOKEN_INVALID');
    }

    if (await authService.isTokenRevoked(payload.jti)) {
      throw ApiError.unauthorized('Authentication token has been revoked. Please log in again.', 'TOKEN_REVOKED');
    }

    const user = await authService.getActiveUser(payload.sub);
    if (!user) {
      throw ApiError.unauthorized('User no longer exists or is deactivated', 'USER_INACTIVE');
    }

    req.user = {
      id: String(user._id),
      role: payload.role,
      jti: payload.jti,
      tokenExpiresAt: new Date(payload.exp * 1000),
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { authenticate };
