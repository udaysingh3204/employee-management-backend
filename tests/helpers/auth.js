'use strict';

const request = require('supertest');

/** Signs up (if needed), requests an OTP and verifies it. Returns { token, user }. */
async function loginAs(app, email, name = 'Test User') {
  await request(app).post('/api/auth/signup').send({ email, name });
  await request(app).post('/api/auth/login').send({ email }).expect(200);
  const res = await request(app).post('/api/auth/verify-otp').send({ email, otp: '123456' }).expect(200);
  return { token: res.body.data.token, user: res.body.data.user };
}

const sampleEmployee = (overrides = {}) => ({
  employeeId: 'EMP001',
  employeeName: 'Rahul Sharma',
  email: 'rahul@example.com',
  phoneNumber: '9876543210',
  designation: 'Software Engineer',
  workLocation: 'Noida',
  ...overrides,
});

module.exports = { loginAs, sampleEmployee };
