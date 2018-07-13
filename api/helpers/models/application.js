 module.exports = require ('../models')('Application', {
    _addedBy         : { type: 'ObjectId', ref: 'User', default: null },
    _proponent       : { type: 'ObjectId', ref: 'Organization', default: null },

    agency           : { type: String, default: '' },
    cl_file          : { type: Number, default: 0 },
    client           : { type: String, default: '' },
    code             : { type: String, trim: true, default: ''},
    description      : { type: String, default: '' },
    internal: {
        notes   : { type: String, default: '' },
        tags    : [[{ type: String, trim: true, default: '[["sysadmin"]]' }]]
    },
    internalID       : { type: Number, default: 0 },
    isDeleted        : { type: Boolean, default: false },
    latitude         : { type: Number, default: 0.00 },
    legalDescription : { type: String },
    longitude        : { type: Number, default: 0.00 },
    name             : { type: String, trim: true },
    postID           : { type: Number, default: 0 },
    publishDate      : { type: Date, default: Date.now },
    purpose          : { type: String },
    region           : { type: String },
    status           : { type: String },
    subpurpose       : { type: String },
    // Note: Default on tag property is purely for display only, they have no real effect on the model
    // This must be done in the code.
    tags             : [[{ type: String, trim: true, default: '[["sysadmin"]]' }]],
    tantalisID       : { type: Number, default: 0 },
});
