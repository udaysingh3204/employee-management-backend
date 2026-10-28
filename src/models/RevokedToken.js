'use strict';

const mongoose = require('mongoose');

/**
 * Token denylist used by logout. Stores only the token id (jti), never the token itself.
 * A TTL index removes entries once the token would have expired anyway.
 */
const revokedTokenSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false }
);

const RevokedToken = mongoose.model('RevokedToken', revokedTokenSchema);

/**
 * TTL index (expireAfterSeconds: 0 → delete at expiresAt). Created separately from the schema
 * so that a MongoDB-compatible server without TTL support only logs a warning instead of
 * failing every other index.
 */
RevokedToken.ensureTtlIndex = async function ensureTtlIndex() {
  try {
    await RevokedToken.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expiresAt_ttl' });
  } catch (err) {
    console.warn(`[db] Could not create TTL index on revoked tokens (${err.message}). Expired entries will not auto-delete.`);
  }
};

module.exports = RevokedToken;
