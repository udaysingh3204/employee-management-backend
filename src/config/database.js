'use strict';

const mongoose = require('mongoose');

// Unknown fields in query filters are dropped instead of being passed to MongoDB.
mongoose.set('strictQuery', true);

let listenersAttached = false;

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  mongoose.connection.on('disconnected', () => console.warn('[db] MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => console.info('[db] MongoDB reconnected'));
  mongoose.connection.on('error', (err) => console.error('[db] MongoDB error:', err.message));
}

/** Makes sure unique (and TTL) indexes exist before the first request is served. */
async function ensureIndexes() {
  // Load every model so its indexes are registered.
  require('../models/User');
  require('../models/Employee');
  const RevokedToken = require('../models/RevokedToken');
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  await RevokedToken.ensureTtlIndex();
}

/**
 * Connects to MongoDB with retries so the server survives a database that starts slowly.
 */
async function connectDatabase(uri, { retries = 5, delayMs = 2000 } = {}) {
  if (!uri) throw new Error('MongoDB connection string is empty');
  attachListeners();

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, autoIndex: true });
      await ensureIndexes();
      return mongoose.connection;
    } catch (err) {
      console.error(`[db] Connection attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase, ensureIndexes };
