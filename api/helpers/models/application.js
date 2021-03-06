module.exports = require('../models')('Application', {
  agency: { type: String, default: '' },
  areaHectares: { type: Number, default: 0.0 },
  businessUnit: { type: String },

  // Centroid (in coordinates) of all features associated with this application.
  centroid: [{ type: Number, default: 0.0 }], // updated by daily script

  cl_file: { type: Number, default: 0 },
  client: { type: String, default: '' },
  _createdBy: { type: String, default: '' }, // updated by API
  createdDate: { type: Date, default: Date.now }, // updated by API
  description: { type: String, default: '' },
  isDeleted: { type: Boolean, default: false }, // updated by API
  legalDescription: { type: String },
  location: { type: String, default: '' },
  name: { type: String, trim: true },
  publishDate: { type: Date },
  purpose: { type: String },
  status: { type: String },
  reason: { type: String },
  subpurpose: { type: String },
  subtype: { type: String },
  tantalisID: { type: Number, default: 0 },
  tenureStage: { type: String },
  type: { type: String },

  // Used to track when the latest status was effective.
  statusHistoryEffectiveDate: { type: Date },

  // Note: Default on tag property is purely for display only, they have no real effect on the model.
  // This must be done in the code.
  tags: [[{ type: String, trim: true, default: '[["sysadmin"]]' }]], // updated by API

  // Used to enable client (applicant) $text search.
  __index: { client: 'text' }
});
