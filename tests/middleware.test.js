'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../src/app');
const User = require('../src/models/User');
const db = require('./helpers/db');
const { loginAs } = require('./helpers/auth');

const app = createApp();
const SECRET = process.env.JWT_SECRET;
const ISSUER = 'employee-management-api';

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

describe('JWT authentication middleware', () => {
  it('401 when the token is missing', async () => {
    const res = await request(app).get('/api/employees');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      message: 'Authentication token is missing',
      error: { code: 'TOKEN_MISSING' },
    });
  });

  it('401 when the header is not "Bearer <token>"', async () => {
    const res = await request(app).get('/api/employees').set('Authorization', 'Token abc');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_MALFORMED');
  });

  it('401 for an invalid token', async () => {
    const res = await request(app).get('/api/employees').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('401 for a token signed with a different secret', async () => {
    const user = await User.create({ email: 'x@example.com' });
    const forged = jwt.sign({ role: 'admin' }, 'some-other-secret', { subject: String(user._id), issuer: ISSUER });
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('401 for an "alg: none" token', async () => {
    const user = await User.create({ email: 'n@example.com' });
    const unsigned = jwt.sign({ role: 'admin' }, null, { algorithm: 'none', subject: String(user._id), issuer: ISSUER });
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${unsigned}`);
    expect(res.status).toBe(401);
  });

  it('401 TOKEN_EXPIRED for an expired token', async () => {
    const user = await User.create({ email: 'e@example.com' });
    const expired = jwt.sign(
      { role: 'user', exp: Math.floor(Date.now() / 1000) - 60 },
      SECRET,
      { subject: String(user._id), issuer: ISSUER, jwtid: 'expired-1' }
    );
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('401 when the user has been deactivated after the token was issued', async () => {
    const { token, user } = await loginAs(app, 'gone@example.com');
    await User.updateOne({ _id: user.id }, { $set: { isActive: false } });
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('USER_INACTIVE');
  });

  it('accepts a valid token', async () => {
    const { token } = await loginAs(app, 'ok@example.com');
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('Misc', () => {
  it('GET /api/health reports database status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.database).toBe('connected');
  });

  it('unknown routes return 404 in the standard shape', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('sets security headers via Helmet', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects oversized bodies with 413', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'a@b.com', name: 'x'.repeat(20000) });
    expect(res.status).toBe(413);
  });
});
