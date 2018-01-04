var auth        = require("../helpers/auth");
var _           = require('lodash');
var defaultLog  = require('winston').loggers.get('default');
var mongoose    = require('mongoose');
var mime        = require('mime-types');
var Actions     = require('../helpers/actions');
var FlakeIdGen  = require('flake-idgen'),
    intformat   = require('biguint-format'),
    generator   = new FlakeIdGen;
var fs          = require('fs');
var uploadDir   = process.env.UPLOAD_DIRECTORY || "./uploads/";

exports.protectedOptions = function (args, res, rest) {
  res.status(200).send();
}

exports.publicGet = function (args, res, next) {
  // Build match query if on docId route
  var query = {};
  if (args.swagger.params.docId) {
    query = { "_id": mongoose.Types.ObjectId(args.swagger.params.docId.value)};
  }
  if (args.swagger.params.application.value) {
    _.assignIn(query, { "application": { $in: args.swagger.params.application.value}}); 
  }

  getDocuments(['public'], query, args.swagger.params.fields.value)
  .then(function (data) {
    return Actions.sendResponse(res, 200, data);
  });
};
exports.protectedGet = function(args, res, next) {
  var self        = this;
  self.scopes     = args.swagger.params.auth_payload.scopes;

  var Document = mongoose.model('Document');

  defaultLog.info("args.swagger.params:", args.swagger.params.auth_payload.scopes);

  // Build match query if on docId route
  var query = {};
  if (args.swagger.params.docId) {
    query = { "_id": mongoose.Types.ObjectId(args.swagger.params.docId.value)};
  }
  if (args.swagger.params.application.value) {
    _.assignIn(query, { "application": { $in: args.swagger.params.application.value}}); 
  }

  getDocuments(args.swagger.params.auth_payload.scopes, query, args.swagger.params.fields.value)
  .then(function (data) {
    return Actions.sendResponse(res, 200, data);
  });
};

//  Create a new document
exports.protectedPost = function (args, res, next) {
  console.log("Creating new object");
  var obj = args.swagger.params.doc.value;
  defaultLog.info("Incoming new object:", obj);

  var Document = mongoose.model('Document');
  var doc = new Document(obj);
  // Define security tag defaults
  doc.tags = [['sysadmin']];
  doc.save()
  .then(function (d) {
    defaultLog.info("Saved new document object:", d);
    return Actions.sendResponse(res, 200, d);
  });
};

exports.protectedPublish = function (args, res, next) {
  var objId = args.swagger.params.docId.value;
  defaultLog.info("Publish Document:", objId);

  var Document = require('mongoose').model('Document');
  Document.findOne({_id: objId}, function (err, o) {
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
exports.protectedUnPublish = function (args, res, next) {
  var objId = args.swagger.params.docId.value;
  defaultLog.info("UnPublish Document:", objId);

  var Document = require('mongoose').model('Document');
  Document.findOne({_id: objId}, function (err, o) {
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

// Update an existing document
exports.protectedPut = function (args, res, next) {
  // defaultLog.info("upfile:", args.swagger.params.upfile);
  var objId = args.swagger.params.docId.value;
  defaultLog.info("ObjectID:", args.swagger.params.docId.value);

  var guid = intformat(generator.next(), 'dec');
  var ext = mime.extension(args.swagger.params.upfile.value.mimetype);
  try {
    fs.writeFileSync(uploadDir+guid+"."+ext, args.swagger.params.upfile.value.buffer);
  } catch (e) {
    defaultLog.info("Error:", e);
    // Delete the path details before we return to the caller.
    delete e['path'];
    return Actions.sendResponse(res, 400, e);
  }

  var obj = args.swagger.params;
  // Strip security tags - these will not be updated on this route.
  delete obj.tags;
  defaultLog.info("Incoming updated object:", obj);

  var Document = require('mongoose').model('Document');
  Document.findOneAndUpdate({_id: objId}, obj, {upsert:false, new: true}, function (err, o) {
    if (o) {
      defaultLog.info("o:", o);
      return Actions.sendResponse(res, 200, o);
    } else {
      defaultLog.info("Couldn't find that object!");
      return Actions.sendResponse(res, 404, {});
    }
  });
}

var getDocuments = function (role, query, fields) {
  return new Promise(function (resolve, reject) {
    var Document = mongoose.model('Document');
    var projection = {};

    // Fields we always return
    var defaultFields = ['_id',
                        'tags'];
    _.each(defaultFields, function (f) {
        projection[f] = 1;
    });

    // Add requested fields - sanitize first by including only those that we can/want to return
    var sanitizedFields = _.remove(fields, function (f) {
      return (_.indexOf(['displayName',
                         'documentFileName',
                         'internalMime'], f) !== -1);
    });
    _.each(sanitizedFields, function (f) {
      projection[f] = 1;
    });

    Document.aggregate([
      {
        "$match": query
      },
      {
        "$project": projection
      },
      {
        $redact: {
         $cond: {
            if: {
              $anyElementTrue: {
                    $map: {
                      input: "$tags" ,
                      as: "fieldTag",
                      in: { $setIsSubset: [ "$$fieldTag", role ] }
                    }
                  }
                },
              then: "$$DESCEND",
              else: "$$PRUNE"
            }
          }
        }
    ]).exec()
    .then(function (data) {
      defaultLog.info("data:", data);
      resolve(data);
    });
  });
};