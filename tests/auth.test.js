'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { loginAs } = require('./helpers/auth');

const app = createApp();

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

describe('POST /api/auth/signup', () => {
  it('creates a user with role "user" and hides internal fields', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: '  Jane@Example.COM ', name: 'Jane' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({ email: 'jane@example.com', name: 'Jane', role: 'user' });
    expect(res.body.data.user).not.toHaveProperty('otpFailedAttempts');
    expect(res.body.data.user).not.toHaveProperty('otpRequestedAt');
  });

  it('ignores a role supplied in the body (no self-promotion to admin)', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'sneaky@example.com', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('user');
  });

  it('gives the admin role only to emails listed in ADMIN_EMAILS', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'ADMIN@test.com' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('admin');
  });

  it('returns 409 for an existing email (case-insensitive)', async () => {
    await request(app).post('/api/auth/signup').send({ email: 'dup@example.com' }).expect(201);
    const res = await request(app).post('/api/auth/signup').send({ email: 'DUP@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USER_ALREADY_EXISTS');
  });

  it('returns 422 for an invalid email', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('email');
  });

  it('blocks NoSQL operator injection in the body', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: { $ne: null } });
    expect(res.status).toBe(422);
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('POST /api/auth/login', () => {
  it('issues an OTP but no token', async () => {
    await request(app).post('/api/auth/signup').send({ email: 'a@example.com' });
    const res = await request(app).post('/api/auth/login').send({ email: 'a@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.data.nextStep).toBe('POST /api/auth/verify-otp');
    expect(res.body.data).not.toHaveProperty('token');
    expect(JSON.stringify(res.body)).not.toContain('123456');
  });

  it('returns 404 for an unknown email', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });
});

describe('POST /api/auth/verify-otp', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/signup').send({ email: 'v@example.com', name: 'V' });
  });

  it('returns a signed JWT with the user id and role', async () => {
    await request(app).post('/api/auth/login').send({ email: 'v@example.com' }).expect(200);
    const res = await request(app).post('/api/auth/verify-otp').send({ email: 'v@example.com', otp: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.data.tokenType).toBe('Bearer');
    const decoded = jwt.decode(res.body.data.token);
    expect(decoded.sub).toBe(res.body.data.user.id);
    expect(decoded.role).toBe('user');
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
    expect(JSON.stringify(res.body)).not.toContain(process.env.JWT_SECRET);
  });

  it('requires /login to be called first', async () => {
    const res = await request(app).post('/api/auth/verify-otp').send({ email: 'v@example.com', otp: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_NOT_REQUESTED_OR_EXPIRED');
  });

  it('rejects a wrong OTP with 401 and reports remaining attempts', async () => {
    await request(app).post('/api/auth/login').send({ email: 'v@example.com' });
    const res = await request(app).post('/api/auth/verify-otp').send({ email: 'v@example.com', otp: '000000' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_OTP');
    expect(res.body.error.details.attemptsRemaining).toBe(2);
  });

  it('locks the account after too many wrong OTPs', async () => {
    await request(app).post('/api/auth/login').send({ email: 'v@example.com' });
    await request(app).post('/api/auth/verify-otp').send({ email: 'v@example.com', otp: '000000' }).expect(401);
    await request(app).post('/api/auth/verify-otp').send({ email: 'v@example.com', otp: '000000' }).expect(401);
    const locked = await request(app).post('/api/auth/verify-otp').send({ email: 'v@example.com', otp: '000000' });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('OTP_LOCKED');
    // Even the right OTP is refused while locked
    const again = await request(app).post('/api/auth/login').send({ email: 'v@example.com' });
    expect(again.status).toBe(429);
  });

  it('treats an OTP as single-use', async () => {
    await request(app).post('/api/auth/login').send({ email: 'v@example.com' });
    await request(app).post('/api/auth/verify-otp').send({ email: 'v@example.com', otp: '123456' }).expect(200);
    const reuse = await request(app).post('/api/auth/verify-otp').send({ email: 'v@example.com', otp: '123456' });
    expect(reuse.status).toBe(400);
  });

  it('returns 422 for a non-numeric OTP', async () => {
    const res = await request(app).post('/api/auth/verify-otp').send({ email: 'v@example.com', otp: 'abc' });
    expect(res.status).toBe(422);
  });
});

describe('POST /api/auth/logout and GET /api/auth/me', () => {
  it('revokes the token so it cannot be reused', async () => {
    const { token } = await loginAs(app, 'out@example.com');
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    const out = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(out.status).toBe(200);
    const after = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('TOKEN_REVOKED');
  });

  it('logout requires a token', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
});
