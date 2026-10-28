'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const { ensureIndexes } = require('../../src/config/database');

/**
 * Isolated test database.
 * - If MONGODB_URI_TEST is set, each test file gets its own randomly named database on that
 *   server, which is dropped afterwards.
 * - Otherwise a throwaway in-memory MongoDB is started (mongodb-memory-server).
 * Production data is never touched.
 */
let memoryServer;

async function connect() {
  let uri;
  const base = process.env.MONGODB_URI_TEST;
  if (base) {
    const dbName = `emp_test_${crypto.randomBytes(4).toString('hex')}`;
    const url = new URL(base);
    url.pathname = `/${dbName}`;
    uri = url.toString();
  } else {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri('emp_test');
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  await ensureIndexes();
}

async function clear() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

async function close() {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  if (memoryServer) await memoryServer.stop();
}

module.exports = { connect, clear, close };
