'use strict';

const { matchedData } = require('express-validator');
const employeeService = require('../services/employee.service');
const { sendSuccess } = require('../utils/apiResponse');

// matchedData returns only fields declared in the validators, already sanitized.
const bodyData = (req) => matchedData(req, { locations: ['body'], includeOptionals: false });

async function create(req, res) {
  const employee = await employeeService.createEmployee(bodyData(req));
  return sendSuccess(res, { statusCode: 201, message: 'Employee created successfully', data: employee });
}

async function list(req, res) {
  const { items, meta } = await employeeService.listEmployees(req.query);
  return sendSuccess(res, { message: 'Employees fetched successfully', data: items, meta });
}

async function getById(req, res) {
  const employee = await employeeService.getEmployeeById(req.params.id);
  return sendSuccess(res, { message: 'Employee fetched successfully', data: employee });
}

async function update(req, res) {
  const employee = await employeeService.updateEmployee(req.params.id, bodyData(req));
  return sendSuccess(res, { message: 'Employee updated successfully', data: employee });
}

async function deactivate(req, res) {
  const employee = await employeeService.setActive(req.params.id, false);
  return sendSuccess(res, { message: 'Employee deactivated (soft delete). Record kept.', data: employee });
}

async function activate(req, res) {
  const employee = await employeeService.setActive(req.params.id, true);
  return sendSuccess(res, { message: 'Employee reactivated', data: employee });
}

async function remove(req, res) {
  const employee = await employeeService.deleteEmployee(req.params.id);
  return sendSuccess(res, {
    message: 'Employee permanently deleted',
    data: { id: String(employee._id), employeeId: employee.employeeId },
  });
}

module.exports = { create, list, getById, update, deactivate, activate, remove };
