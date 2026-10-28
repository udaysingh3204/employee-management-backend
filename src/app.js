'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
const config = require('./config/env');
const authRoutes = require('./routes/auth.routes');
const employeeRoutes = require('./routes/employee.routes');
const { sanitizeRequest } = require('./middlewares/sanitize.middleware');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins.includes('*') ? '*' : config.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );
  app.use(express.json({ limit: config.bodyLimit }));

  // Request log: method, path, status, time. Never headers or bodies, so no tokens/OTPs are logged.
  if (!config.isTest) {
    morgan.token('path', (req) => req.originalUrl.split('?')[0]);
    app.use(morgan(':method :path :status :response-time ms'));
  }

  app.use(sanitizeRequest);

  app.get('/api/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({
      success: dbUp,
      message: dbUp ? 'OK' : 'Database unavailable',
      data: { status: dbUp ? 'up' : 'degraded', database: dbUp ? 'connected' : 'disconnected', uptimeSeconds: Math.round(process.uptime()) },
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/employees', employeeRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
