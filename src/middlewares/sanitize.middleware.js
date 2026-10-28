'use strict';

/**
 * NoSQL-injection guard: removes keys that start with "$" or contain "." from
 * req.body and req.params (recursively), so values like {"email": {"$ne": null}}
 * can never become MongoDB operators.
 *
 * req.query needs no stripping: Express 5 uses the "simple" query parser, which only
 * produces strings and arrays of strings, and the services coerce every value to a string.
 */
function clean(value, depth = 0) {
  if (depth > 10 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));

  const out = {};
  for (const [key, v] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    out[key] = clean(v, depth + 1);
  }
  return out;
}

function sanitizeRequest(req, _res, next) {
  if (req.body && typeof req.body === 'object') req.body = clean(req.body);
  if (req.params && typeof req.params === 'object') {
    for (const key of Object.keys(req.params)) req.params[key] = clean(req.params[key]);
  }
  next();
}

module.exports = { sanitizeRequest, clean };
