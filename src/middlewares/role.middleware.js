'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Allows the request only if req.user.role is one of the given roles.
 * Must run after authenticate. Returns 403 for authenticated users without permission.
 */
function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action', 'INSUFFICIENT_ROLE'));
    }
    return next();
  };
}

module.exports = { authorize };
