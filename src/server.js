'use strict';

const config = require('./config/env'); // validates env first; throws on bad config
const createApp = require('./app');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const { providerName } = require('./services/otp.service');

async function start() {
  await connectDatabase(config.mongoUri);
  console.info('[db] Connected to MongoDB');

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.info(`[server] Employee Management API listening on http://localhost:${config.port} (${config.nodeEnv})`);
    console.info(`[server] Base URL: http://localhost:${config.port}/api`);
    if (providerName() === 'hardcoded') {
      console.warn('[security] Hardcoded OTP is ENABLED. Development/testing only; never use in production.');
    }
  });

  const shutdown = (signal) => {
    console.info(`[server] ${signal} received, shutting down gracefully`);
    server.close(async () => {
      await disconnectDatabase().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled promise rejection:', reason);
});

start().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  process.exit(1);
});
