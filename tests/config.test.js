'use strict';

/** Startup safety checks in src/config/env.js. */
function loadConfigWith(overrides) {
  const saved = { ...process.env };
  Object.assign(process.env, overrides);
  for (const [k, v] of Object.entries(overrides)) if (v === undefined) delete process.env[k];
  try {
    let cfg;
    jest.isolateModules(() => {
      jest.doMock('dotenv', () => ({ config: () => ({}) })); // ignore any local .env file
      cfg = require('../src/config/env');
    });
    return cfg;
  } finally {
    process.env = saved;
  }
}

const STRONG_SECRET = 'a3f9c27e8b1d4f6a0c5e9b2d7f1a3c8e6b4d0f2a';

describe('Environment validation', () => {
  it('refuses to start in production while HARDCODED_OTP is set', () => {
    expect(() =>
      loadConfigWith({
        NODE_ENV: 'production',
        JWT_SECRET: STRONG_SECRET,
        MONGODB_URI: 'mongodb://localhost/x',
        HARDCODED_OTP: '123456',
      })
    ).toThrow(/HARDCODED_OTP/);
  });

  it('refuses a weak JWT secret in production', () => {
    expect(() =>
      loadConfigWith({
        NODE_ENV: 'production',
        JWT_SECRET: 'short',
        MONGODB_URI: 'mongodb://localhost/x',
        HARDCODED_OTP: undefined,
      })
    ).toThrow(/JWT_SECRET/);
  });

  it('fails when JWT_SECRET is missing', () => {
    expect(() => loadConfigWith({ NODE_ENV: 'development', JWT_SECRET: undefined, MONGODB_URI: 'mongodb://localhost/x' })).toThrow(
      /JWT_SECRET/
    );
  });

  it('fails when MONGODB_URI is missing outside tests', () => {
    expect(() => loadConfigWith({ NODE_ENV: 'development', JWT_SECRET: STRONG_SECRET, MONGODB_URI: undefined })).toThrow(
      /MONGODB_URI/
    );
  });

  it('starts in production with a strong secret and no hardcoded OTP', () => {
    const cfg = loadConfigWith({
      NODE_ENV: 'production',
      JWT_SECRET: STRONG_SECRET,
      MONGODB_URI: 'mongodb://localhost/x',
      HARDCODED_OTP: undefined,
    });
    expect(cfg.isProduction).toBe(true);
    expect(cfg.otp.hardcoded).toBe('');
  });
});
