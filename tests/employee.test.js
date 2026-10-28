'use strict';

const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { loginAs, sampleEmployee } = require('./helpers/auth');

const app = createApp();
let adminToken;
let userToken;

const asAdmin = (req) => req.set('Authorization', `Bearer ${adminToken}`);
const asUser = (req) => req.set('Authorization', `Bearer ${userToken}`);

beforeAll(db.connect);
beforeEach(async () => {
  adminToken = (await loginAs(app, 'admin@test.com', 'Admin')).token;
  userToken = (await loginAs(app, 'user@test.com', 'Normal User')).token;
});
afterEach(db.clear);
afterAll(db.close);

async function createEmployee(overrides) {
  const res = await asAdmin(request(app).post('/api/employees')).send(sampleEmployee(overrides));
  expect(res.status).toBe(201);
  return res.body.data;
}

describe('Create employee', () => {
  it('admin can create; fields are normalized and timestamps set', async () => {
    const res = await asAdmin(request(app).post('/api/employees')).send(
      sampleEmployee({ employeeId: 'emp001', email: 'Rahul@Example.com' })
    );
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Employee created successfully');
    expect(res.body.data).toMatchObject({
      employeeId: 'EMP001',
      email: 'rahul@example.com',
      isActive: true,
    });
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.createdAt).toBeDefined();
    expect(res.body.data.updatedAt).toBeDefined();
  });

  it('normal user gets 403', async () => {
    const res = await asUser(request(app).post('/api/employees')).send(sampleEmployee());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('422 when required fields are missing, listing each field', async () => {
    const res = await asAdmin(request(app).post('/api/employees')).send({ employeeName: 'Only Name' });
    expect(res.status).toBe(422);
    const fields = res.body.error.details.map((d) => d.field).sort();
    expect(fields).toEqual(['designation', 'email', 'employeeId', 'phoneNumber', 'workLocation']);
  });

  it('422 for invalid email and phone', async () => {
    const res = await asAdmin(request(app).post('/api/employees')).send(
      sampleEmployee({ email: 'bad', phoneNumber: 'abc' })
    );
    expect(res.status).toBe(422);
    const fields = res.body.error.details.map((d) => d.field).sort();
    expect(fields).toEqual(['email', 'phoneNumber']);
  });

  it('409 for a duplicate employeeId (case-insensitive)', async () => {
    await createEmployee();
    const res = await asAdmin(request(app).post('/api/employees')).send(
      sampleEmployee({ employeeId: 'emp001', email: 'other@example.com' })
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_EMPLOYEE_ID');
  });

  it('409 for a duplicate email (case-insensitive)', async () => {
    await createEmployee();
    const res = await asAdmin(request(app).post('/api/employees')).send(
      sampleEmployee({ employeeId: 'EMP002', email: 'RAHUL@example.com' })
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_EMAIL');
  });

  it('ignores fields that are not part of the model (mass assignment)', async () => {
    const res = await asAdmin(request(app).post('/api/employees')).send(
      sampleEmployee({ _id: '64b7f0000000000000000000', createdAt: '2000-01-01', salary: 99 })
    );
    expect(res.status).toBe(201);
    expect(res.body.data.id).not.toBe('64b7f0000000000000000000');
    expect(res.body.data.salary).toBeUndefined();
    expect(new Date(res.body.data.createdAt).getFullYear()).toBeGreaterThan(2000);
  });
});

describe('Read employees', () => {
  beforeEach(async () => {
    await createEmployee({ employeeId: 'EMP001', employeeName: 'Rahul Sharma', email: 'rahul@example.com', designation: 'Software Engineer', workLocation: 'Noida' });
    await createEmployee({ employeeId: 'EMP002', employeeName: 'Priya Verma', email: 'priya@example.com', designation: 'Designer', workLocation: 'Delhi' });
    await createEmployee({ employeeId: 'EMP003', employeeName: 'Amit Kumar', email: 'amit@example.com', designation: 'Software Engineer', workLocation: 'Delhi' });
  });

  it('user can list with pagination metadata', async () => {
    const res = await asUser(request(app).get('/api/employees?page=1&limit=2'));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ total: 3, page: 1, limit: 2, totalPages: 2, hasNextPage: true, hasPrevPage: false });

    const page2 = await asUser(request(app).get('/api/employees?page=2&limit=2'));
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.meta.hasNextPage).toBe(false);
  });

  it('filters by designation and workLocation', async () => {
    const res = await asUser(request(app).get('/api/employees?designation=software%20engineer&workLocation=Delhi'));
    expect(res.body.data.map((e) => e.employeeId)).toEqual(['EMP003']);
  });

  it('filters by isActive', async () => {
    const list = await asAdmin(request(app).get('/api/employees?search=EMP002'));
    await asAdmin(request(app).patch(`/api/employees/${list.body.data[0].id}/deactivate`)).expect(200);
    const active = await asUser(request(app).get('/api/employees?isActive=true'));
    const inactive = await asUser(request(app).get('/api/employees?isActive=false'));
    expect(active.body.meta.total).toBe(2);
    expect(inactive.body.data.map((e) => e.employeeId)).toEqual(['EMP002']);
  });

  it('searches by name, employeeId and email', async () => {
    const byName = await asUser(request(app).get('/api/employees?search=priya'));
    expect(byName.body.data.map((e) => e.employeeId)).toEqual(['EMP002']);
    const byId = await asUser(request(app).get('/api/employees?search=emp003'));
    expect(byId.body.data.map((e) => e.employeeId)).toEqual(['EMP003']);
    const byEmail = await asUser(request(app).get('/api/employees?search=rahul@'));
    expect(byEmail.body.data.map((e) => e.employeeId)).toEqual(['EMP001']);
  });

  it('treats regex characters in search literally', async () => {
    const res = await asUser(request(app).get('/api/employees?search=.*'));
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(0);
  });

  it('sorts by a whitelisted field', async () => {
    const res = await asUser(request(app).get('/api/employees?sortBy=employeeName&order=asc'));
    expect(res.body.data.map((e) => e.employeeName)).toEqual(['Amit Kumar', 'Priya Verma', 'Rahul Sharma']);
  });

  it('422 for invalid query params', async () => {
    const res = await asUser(request(app).get('/api/employees?limit=500&sortBy=password'));
    expect(res.status).toBe(422);
  });

  it('gets one employee by id', async () => {
    const created = await createEmployee({ employeeId: 'EMP010', email: 'ten@example.com' });
    const res = await asUser(request(app).get(`/api/employees/${created.id}`));
    expect(res.status).toBe(200);
    expect(res.body.data.employeeId).toBe('EMP010');
  });

  it('400 for a malformed id, 404 for a missing one', async () => {
    const bad = await asUser(request(app).get('/api/employees/123'));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_PARAMS');
    const missing = await asUser(request(app).get('/api/employees/64b7f0000000000000000000'));
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ success: false, message: 'Employee not found', error: { code: 'EMPLOYEE_NOT_FOUND' } });
  });
});

describe('Update employee', () => {
  let emp;
  beforeEach(async () => {
    emp = await createEmployee();
  });

  it('PUT replaces all core fields and bumps updatedAt', async () => {
    await new Promise((r) => setTimeout(r, 20));
    const res = await asAdmin(request(app).put(`/api/employees/${emp.id}`)).send(
      sampleEmployee({ employeeName: 'Rahul S.', designation: 'Senior Engineer', workLocation: 'Gurugram' })
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ employeeName: 'Rahul S.', designation: 'Senior Engineer', workLocation: 'Gurugram' });
    expect(new Date(res.body.data.updatedAt).getTime()).toBeGreaterThan(new Date(emp.updatedAt).getTime());
  });

  it('PUT with missing fields returns 422', async () => {
    const res = await asAdmin(request(app).put(`/api/employees/${emp.id}`)).send({ designation: 'Lead' });
    expect(res.status).toBe(422);
  });

  it('PATCH changes only the supplied fields', async () => {
    const res = await asAdmin(request(app).patch(`/api/employees/${emp.id}`)).send({ designation: 'Tech Lead' });
    expect(res.status).toBe(200);
    expect(res.body.data.designation).toBe('Tech Lead');
    expect(res.body.data.employeeName).toBe('Rahul Sharma');
  });

  it('PATCH with no updatable fields returns 422', async () => {
    const res = await asAdmin(request(app).patch(`/api/employees/${emp.id}`)).send({ salary: 1 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NO_UPDATABLE_FIELDS');
  });

  it('409 when updating to another employee\'s email or id', async () => {
    await createEmployee({ employeeId: 'EMP002', email: 'priya@example.com' });
    const byEmail = await asAdmin(request(app).patch(`/api/employees/${emp.id}`)).send({ email: 'PRIYA@example.com' });
    expect(byEmail.status).toBe(409);
    const byId = await asAdmin(request(app).patch(`/api/employees/${emp.id}`)).send({ employeeId: 'emp002' });
    expect(byId.status).toBe(409);
  });

  it('allows re-saving its own email and id', async () => {
    const res = await asAdmin(request(app).patch(`/api/employees/${emp.id}`)).send({ email: 'rahul@example.com', employeeId: 'EMP001' });
    expect(res.status).toBe(200);
  });

  it('404 for a nonexistent employee', async () => {
    const res = await asAdmin(request(app).patch('/api/employees/64b7f0000000000000000000')).send({ designation: 'X' });
    expect(res.status).toBe(404);
  });

  it('normal user gets 403', async () => {
    const res = await asUser(request(app).patch(`/api/employees/${emp.id}`)).send({ designation: 'Hacker' });
    expect(res.status).toBe(403);
  });
});

describe('Delete and deactivate', () => {
  it('admin soft-deletes (deactivate) and reactivates', async () => {
    const emp = await createEmployee();
    const off = await asAdmin(request(app).patch(`/api/employees/${emp.id}/deactivate`));
    expect(off.status).toBe(200);
    expect(off.body.data.isActive).toBe(false);
    const on = await asAdmin(request(app).patch(`/api/employees/${emp.id}/activate`));
    expect(on.body.data.isActive).toBe(true);
  });

  it('admin permanently deletes; then 404', async () => {
    const emp = await createEmployee();
    const res = await asAdmin(request(app).delete(`/api/employees/${emp.id}`));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: emp.id, employeeId: 'EMP001' });
    await asAdmin(request(app).get(`/api/employees/${emp.id}`)).expect(404);
    await asAdmin(request(app).delete(`/api/employees/${emp.id}`)).expect(404);
  });

  it('normal user cannot delete (403)', async () => {
    const emp = await createEmployee();
    const res = await asUser(request(app).delete(`/api/employees/${emp.id}`));
    expect(res.status).toBe(403);
  });
});
