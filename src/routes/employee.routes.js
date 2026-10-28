'use strict';

const { Router } = require('express');
const controller = require('../controllers/employee.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validation.middleware');
const { ROLES } = require('../models/User');
const v = require('../validators/employee.validator');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();
const adminOnly = authorize(ROLES.ADMIN);
const anyRole = authorize(ROLES.ADMIN, ROLES.USER);

// Every employee route requires a valid JWT.
router.use(authenticate);

router
  .route('/')
  .get(anyRole, v.listEmployeesRules, validate, asyncHandler(controller.list))
  .post(adminOnly, v.createEmployeeRules, validate, asyncHandler(controller.create));

router
  .route('/:id')
  .get(anyRole, v.idParamRules, validate, asyncHandler(controller.getById))
  .put(adminOnly, v.replaceEmployeeRules, validate, asyncHandler(controller.update)) // full update
  .patch(adminOnly, v.patchEmployeeRules, validate, asyncHandler(controller.update)) // partial update
  .delete(adminOnly, v.idParamRules, validate, asyncHandler(controller.remove)); // permanent delete

router.patch('/:id/deactivate', adminOnly, v.idParamRules, validate, asyncHandler(controller.deactivate));
router.patch('/:id/activate', adminOnly, v.idParamRules, validate, asyncHandler(controller.activate));

module.exports = router;
