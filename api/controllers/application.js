var auth        = require("../helpers/auth");
var _           = require('lodash');
var defaultLog  = require('winston').loggers.get('default');
var mongoose    = require('mongoose');
var Actions     = require('../helpers/actions');
var Utils       = require('../helpers/utils');

var DEFAULT_PAGESIZE = 100;
var MAX_LIMIT = 1000;

exports.protectedOptions = function (args, res, rest) {
  res.status(200).send();
};

exports.publicGet = function (args, res, next) {
  var query = {};
  var skip = null, limit = null;

  // Never return deleted app(s).
  _.assignIn(query, { isDeleted: false });

  // Build match query if on appId route.
  // Otherwise, build filter query.
  if (args.swagger.params.appId) {
    query = Utils.buildQuery("_id", args.swagger.params.appId.value, query);
  } else {
    if (args.swagger.params.regions && args.swagger.params.regions.value !== undefined) {
      _.assignIn(query, { region: { $in: args.swagger.params.regions.value } });
    }
    if (args.swagger.params.cpStatuses && args.swagger.params.cpStatuses.value !== undefined) {
      // TODO: compute cp_status from comment periods
      // _.assignIn(query, { cp_status: { $in: args.swagger.params.cpStatuses.value } });
    }
    if (args.swagger.params.statuses && args.swagger.params.statuses.value !== undefined) {
      _.assignIn(query, { status: { $in: args.swagger.params.statuses.value } });
    }
    if (args.swagger.params.client && args.swagger.params.client.value !== undefined) {
      _.assignIn(query, { client: { $regex: args.swagger.params.client.value, $options: "i" } });
    }
    if (args.swagger.params.cl_file && args.swagger.params.cl_file.value !== undefined) {
      // TODO: use $redact and then use conditional logic processing $indexOfCP
      // ref: https://stackoverflow.com/questions/2908100/mongodb-regex-search-on-integer-value
      _.assignIn(query, { cl_file: args.swagger.params.cl_file.value }); // EXACT MATCH FOR NOW
    }
    if (args.swagger.params.tantalisID && args.swagger.params.tantalisID.value !== undefined) {
      // TODO: use $redact and then use conditional logic processing $indexOfCP
      // ref: https://stackoverflow.com/questions/2908100/mongodb-regex-search-on-integer-value
      _.assignIn(query, { tantalisID: args.swagger.params.tantalisID.value }); // EXACT MATCH FOR NOW
    }
    if (args.swagger.params.purpose && args.swagger.params.purpose.value !== undefined) {
      _.assignIn(query, {
        $or: [
          { purpose: { $regex: args.swagger.params.purpose.value, $options: "i" } },
          { subpurpose: { $regex: args.swagger.params.purpose.value, $options: "i" } }
        ]
      });
    }

    var pageSize = DEFAULT_PAGESIZE;
    if (args.swagger.params.pageSize && args.swagger.params.pageSize.value !== undefined) {
      if (args.swagger.params.pageSize.value > 0) {
        pageSize = args.swagger.params.pageSize.value;
      }
    }
    if (args.swagger.params.pageNum && args.swagger.params.pageNum.value !== undefined) {
      if (args.swagger.params.pageNum.value >= 0) {
        skip = (args.swagger.params.pageNum.value * pageSize);
        limit = pageSize;
      }
    }
  }

  getApplications(['public'], query, args.swagger.params.fields.value, skip, limit)
    .then(function (data) {
      return Actions.sendResponse(res, 200, data);
    });
};

exports.protectedGet = function (args, res, next) {
  // defaultLog.info("args.swagger.params:", args.swagger.params.auth_payload.scopes);

  var query = {};
  var skip = null, limit = null;

  // Unless they specifically ask for it, don't return deleted app(s).
  if (args.swagger.params.isDeleted && args.swagger.params.isDeleted.value === true) {
    _.assignIn(query, { isDeleted: true });
  } else {
    _.assignIn(query, { isDeleted: false });
  }

  // Build match query if on appId route.
  // Otherwise, build search query.
  if (args.swagger.params.appId) {
    query = Utils.buildQuery("_id", args.swagger.params.appId.value, query);
  } else {
    if (args.swagger.params.regions && args.swagger.params.regions.value !== undefined) {
      _.assignIn(query, { region: { $in: args.swagger.params.regions.value } });
    }
    if (args.swagger.params.cp_statuses && args.swagger.params.cp_statuses.value !== undefined) {
      // TODO: compute cp_status from comment periods
      // _.assignIn(query, { cp_status: { $in: args.swagger.params.cp_statuses.value } });
    }
    if (args.swagger.params.statuses && args.swagger.params.statuses.value !== undefined) {
      _.assignIn(query, { status: { $in: args.swagger.params.statuses.value } });
    }
    if (args.swagger.params.client && args.swagger.params.client.value !== undefined) {
      _.assignIn(query, { client: { $regex: args.swagger.params.client.value, $options: "i" } });
    }
    if (args.swagger.params.cl_file && args.swagger.params.cl_file.value !== undefined) {
      // TODO: use $redact and then use conditional logic processing $indexOfCP
      // ref: https://stackoverflow.com/questions/2908100/mongodb-regex-search-on-integer-value
      _.assignIn(query, { cl_file: args.swagger.params.cl_file.value }); // EXACT MATCH FOR NOW
    }
    if (args.swagger.params.tantalisID && args.swagger.params.tantalisID.value !== undefined) {
      // TODO: use $redact and then use conditional logic processing $indexOfCP
      // ref: https://stackoverflow.com/questions/2908100/mongodb-regex-search-on-integer-value
      _.assignIn(query, { tantalisID: args.swagger.params.tantalisID.value }); // EXACT MATCH FOR NOW
    }
    if (args.swagger.params.purpose && args.swagger.params.purpose.value !== undefined) {
      _.assignIn(query, {
        $or: [
          { purpose: { $regex: args.swagger.params.purpose.value, $options: "i" } },
          { subpurpose: { $regex: args.swagger.params.purpose.value, $options: "i" } }
        ]
      });
    }

    var pageSize = DEFAULT_PAGESIZE;
    if (args.swagger.params.pageSize && args.swagger.params.pageSize.value !== undefined) {
      if (args.swagger.params.pageSize.value > 0) {
        pageSize = args.swagger.params.pageSize.value;
      }
    }
    if (args.swagger.params.pageNum && args.swagger.params.pageNum.value !== undefined) {
      if (args.swagger.params.pageNum.value >= 0) {
        skip = (args.swagger.params.pageNum.value * pageSize);
        limit = pageSize;
      }
    }
  }

  getApplications(args.swagger.params.auth_payload.scopes, query, args.swagger.params.fields.value, skip, limit)
    .then(function (data) {
      return Actions.sendResponse(res, 200, data);
    });
};

exports.protectedDelete = function (args, res, next) {
  var appId = args.swagger.params.appId.value;
  defaultLog.info("Delete Application:", appId);

  var Application = mongoose.model('Application');
  Application.findOne({ _id: appId }, function (err, o) {
    if (o) {
      defaultLog.info("o:", o);

      // Set the deleted flag.
      Actions.delete(o)
        .then(function (deleted) {
          // Deleted successfully
          return Actions.sendResponse(res, 200, deleted);
        }, function (err) {
          // Error
          return Actions.sendResponse(res, 400, err);
        });
    } else {
      defaultLog.info("Couldn't find that object!");
      return Actions.sendResponse(res, 404, {});
    }
  });
}

// Create a new application.
exports.protectedPost = function (args, res, next) {
  var obj = args.swagger.params.app.value;
  defaultLog.info("Incoming new object:", obj);

  var Application = mongoose.model('Application');
  var app = new Application(obj);
  // Define security tag defaults
  app.tags = [['sysadmin']];
  app.internal.tags = [['sysadmin']];
  app._addedBy = args.swagger.params.auth_payload.userID;
  app.save()
    .then(function (a) {
      // defaultLog.info("Saved new application object:", a);
      return Actions.sendResponse(res, 200, a);
    });
};

// Update an existing application.
exports.protectedPut = function (args, res, next) {
  var objId = args.swagger.params.appId.value;
  defaultLog.info("ObjectID:", args.swagger.params.appId.value);

  var obj = args.swagger.params.AppObject.value;
  // Strip security tags - these will not be updated on this route.
  delete obj.tags;
  if (obj.internal && obj.internal.tags) {
    delete obj.internal.tags;
  }
  defaultLog.info("Incoming updated object:", obj);
  // TODO sanitize/update audits.

  // Never allow this to be updated
  if (obj.internal) {
    delete obj.internal.tags;
    obj.internal.tags = [['sysadmin']];
  }

  var Application = require('mongoose').model('Application');
  Application.findOneAndUpdate({ _id: objId }, obj, { upsert: false, new: true }, function (err, o) {
    if (o) {
      defaultLog.info("o:", o);
      return Actions.sendResponse(res, 200, o);
    } else {
      defaultLog.info("Couldn't find that object!");
      return Actions.sendResponse(res, 404, {});
    }
  });
};

// Publish the application.
exports.protectedPublish = function (args, res, next) {
  var objId = args.swagger.params.appId.value;
  defaultLog.info("Publish Application:", objId);

  var Application = require('mongoose').model('Application');
  Application.findOne({ _id: objId }, function (err, o) {
    if (o) {
      defaultLog.info("o:", o);

      // Add public to the tag of this obj.
      Actions.publish(o)
        .then(function (published) {
          // Published successfully
          return Actions.sendResponse(res, 200, published);
        }, function (err) {
          // Error
          return Actions.sendResponse(res, err.code, err);
        });
    } else {
      defaultLog.info("Couldn't find that object!");
      return Actions.sendResponse(res, 404, {});
    }
  });
};

// Unpublish the application.
exports.protectedUnPublish = function (args, res, next) {
  var objId = args.swagger.params.appId.value;
  defaultLog.info("UnPublish Application:", objId);

  var Application = require('mongoose').model('Application');
  Application.findOne({ _id: objId }, function (err, o) {
    if (o) {
      defaultLog.info("o:", o);

      // Remove public to the tag of this obj.
      Actions.unPublish(o)
        .then(function (unpublished) {
          // UnPublished successfully
          return Actions.sendResponse(res, 200, unpublished);
        }, function (err) {
          // Error
          return Actions.sendResponse(res, err.code, err);
        });
    } else {
      defaultLog.info("Couldn't find that object!");
      return Actions.sendResponse(res, 404, {});
    }
  });
};

var getApplications = function (role, query, fields, skip, limit) {
  return new Promise(function (resolve, reject) {
    var Application = mongoose.model('Application');
    var projection = {};

    // Fields we always return
    var defaultFields = ['_id',
      'code',
      'tags'];
    _.each(defaultFields, function (f) {
      projection[f] = 1;
    });

    // Add requested fields - sanitize first by including only those that we can/want to return
    var sanitizedFields = _.remove(fields, function (f) {
      return (_.indexOf(['agency',
        'cl_file',
        'client',
        'code',
        'description',
        'internal',
        'internalID',
        'latitude',
        'legalDescription',
        'longitude',
        'name',
        'postID',
        'publishDate',
        'purpose',
        'region',
        'status',
        'subpurpose',
        'tantalisID'], f) !== -1);
    });
    _.each(sanitizedFields, function (f) {
      projection[f] = 1;
    });

    Application.aggregate([
      { "$match": query },
      { "$project": projection },
      {
        $redact: {
          $cond: {
            if: {
              $anyElementTrue: {
                $map: {
                  input: "$tags",
                  as: "fieldTag",
                  in: { $setIsSubset: ["$$fieldTag", role] }
                }
              }
            },
            then: "$$DESCEND",
            else: "$$PRUNE"
          }
        }
      },
      { "$skip": skip || 0 },
      { "$limit": limit || MAX_LIMIT }
    ]).exec()
      .then(function (data) {
        defaultLog.info("data:", data);
        resolve(data);
      });
  });
};
