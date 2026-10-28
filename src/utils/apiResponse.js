'use strict';

/** Sends the standard success envelope: { success, message, data, meta? } */
function sendSuccess(res, { statusCode = 200, message = 'OK', data = null, meta } = {}) {
  const body = { success: true, message, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(statusCode).json(body);
}

module.exports = { sendSuccess };
