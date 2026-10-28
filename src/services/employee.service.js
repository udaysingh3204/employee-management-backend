'use strict';

const Employee = require('../models/Employee');
const ApiError = require('../utils/ApiError');
const escapeRegex = require('../utils/escapeRegex');

const SORTABLE_FIELDS = Object.freeze([
  'createdAt',
  'updatedAt',
  'employeeName',
  'employeeId',
  'designation',
  'workLocation',
]);

/** Copies only whitelisted fields from untrusted input (blocks mass assignment). */
function pickWritable(input) {
  const out = {};
  for (const field of Employee.WRITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field) && input[field] !== undefined) {
      out[field] = input[field];
    }
  }
  return out;
}

function translateDuplicateKey(err) {
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'field';
    const code = field === 'employeeId' ? 'DUPLICATE_EMPLOYEE_ID' : field === 'email' ? 'DUPLICATE_EMAIL' : 'DUPLICATE_KEY';
    return ApiError.conflict(`An employee with this ${field} already exists`, code, { field });
  }
  return err;
}

/** Friendly pre-check; the unique index remains the real guarantee under concurrency. */
async function assertUnique({ employeeId, email }, excludeId) {
  const checks = [];
  if (employeeId) checks.push({ employeeId: String(employeeId).trim().toUpperCase() });
  if (email) checks.push({ email: String(email).trim().toLowerCase() });
  if (checks.length === 0) return;

  const filter = { $or: checks };
  if (excludeId) filter._id = { $ne: excludeId };
  const clash = await Employee.findOne(filter).select('employeeId email').lean();
  if (!clash) return;

  if (employeeId && clash.employeeId === String(employeeId).trim().toUpperCase()) {
    throw ApiError.conflict('An employee with this employeeId already exists', 'DUPLICATE_EMPLOYEE_ID', {
      field: 'employeeId',
    });
  }
  throw ApiError.conflict('An employee with this email already exists', 'DUPLICATE_EMAIL', { field: 'email' });
}

async function createEmployee(input) {
  const data = pickWritable(input);
  await assertUnique(data);
  try {
    return await Employee.create(data);
  } catch (err) {
    throw translateDuplicateKey(err);
  }
}

async function listEmployees(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 10));

  // Every value is coerced to a string, so no operator objects can reach MongoDB.
  const filter = {};
  if (query.designation) filter.designation = new RegExp(`^${escapeRegex(query.designation)}$`, 'i');
  if (query.workLocation) filter.workLocation = new RegExp(`^${escapeRegex(query.workLocation)}$`, 'i');
  if (query.isActive !== undefined && query.isActive !== '') filter.isActive = String(query.isActive) === 'true';

  if (query.search) {
    const rx = new RegExp(escapeRegex(String(query.search).trim()), 'i');
    filter.$or = [{ employeeName: rx }, { employeeId: rx }, { email: rx }];
  }

  const sortBy = SORTABLE_FIELDS.includes(query.sortBy) ? query.sortBy : 'createdAt';
  const order = String(query.order).toLowerCase() === 'asc' ? 1 : -1;

  const [items, total] = await Promise.all([
    Employee.find(filter)
      .sort({ [sortBy]: order, _id: order })
      .skip((page - 1) * limit)
      .limit(limit),
    Employee.countDocuments(filter),
  ]);

  return {
    items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
      sortBy,
      order: order === 1 ? 'asc' : 'desc',
    },
  };
}

async function getEmployeeById(id) {
  const employee = await Employee.findById(id);
  if (!employee) throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
  return employee;
}

/**
 * Updates an employee with the supplied writable fields.
 * The route validators decide what must be present: PUT requires every core field,
 * PATCH accepts any subset.
 */
async function updateEmployee(id, input) {
  const data = pickWritable(input);
  if (Object.keys(data).length === 0) {
    throw ApiError.unprocessable('No updatable fields were provided', 'NO_UPDATABLE_FIELDS');
  }
  await getEmployeeById(id);
  await assertUnique(data, id);
  try {
    const updated = await Employee.findByIdAndUpdate(
      id,
      { $set: data },
      { returnDocument: 'after', runValidators: true }
    );
    if (!updated) throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
    return updated;
  } catch (err) {
    throw translateDuplicateKey(err);
  }
}

async function setActive(id, isActive) {
  const updated = await Employee.findByIdAndUpdate(id, { $set: { isActive } }, { returnDocument: 'after' });
  if (!updated) throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
  return updated;
}

async function deleteEmployee(id) {
  const deleted = await Employee.findByIdAndDelete(id);
  if (!deleted) throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
  return deleted;
}

module.exports = {
  createEmployee,
  listEmployees,
  getEmployeeById,
  updateEmployee,
  setActive,
  deleteEmployee,
  SORTABLE_FIELDS,
};
