'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/env');

const ALGORITHM = 'HS256';

/**
 * Signs a JWT for an authenticated user.
 * Payload: sub (user id), role, jti (unique token id used for logout/revocation).
 */
function generateToken(user) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ role: user.role }, config.jwt.secret, {
    algorithm: ALGORITHM,
    subject: String(user._id),
    expiresIn: config.jwt.expiresIn,
    issuer: config.jwt.issuer,
    jwtid: jti,
  });
  const { exp } = jwt.decode(token);
  return { token, jti, expiresAt: new Date(exp * 1000) };
}

/** Verifies signature, algorithm, issuer and expiry. Throws jsonwebtoken errors on failure. */
function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret, {
    algorithms: [ALGORITHM],
    issuer: config.jwt.issuer,
  });
}

module.exports = { generateToken, verifyToken };
