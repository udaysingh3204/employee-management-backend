'use strict';

const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true, // "emp001" and "EMP001" are the same employee
      maxlength: 30,
    },
    employeeName: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true, // normalized before storing and comparing
      maxlength: 254,
    },
    phoneNumber: { type: String, required: true, trim: true, maxlength: 20 },
    designation: { type: String, required: true, trim: true, maxlength: 100 },
    workLocation: { type: String, required: true, trim: true, maxlength: 100 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        return ret;
      },
    },
  }
);

employeeSchema.index({ designation: 1 });
employeeSchema.index({ workLocation: 1 });
employeeSchema.index({ isActive: 1 });

// Fields a client may set on create/update. Everything else is ignored (mass-assignment guard).
employeeSchema.statics.WRITABLE_FIELDS = Object.freeze([
  'employeeId',
  'employeeName',
  'email',
  'phoneNumber',
  'designation',
  'workLocation',
  'isActive',
]);

module.exports = mongoose.model('Employee', employeeSchema);
