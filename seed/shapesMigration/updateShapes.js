/**
 * This script performs various updates to ACRFD applications in order to keep them up to date with whatever information is in Tantalis (the source of truth).
 *
 * 1. Authenticates with ACRFD
 * 2. Unpublishes retired applications:
 *    a. Fetches all ACRFD applications that have reached a retired state (assumes 6 months is the retirement period), and unpublishes any found.
 * 3. AUthenticates with Tantalis
 * 4. Updates non-deleted ACRFD applications:
 *    a. Fetches all Tantalis applications that have had an update within the last 1 week.
 *    b. Fetches all non-deleted ACRFD tantalisIDs.
 *    c. For each ACRFD application with a matching Tantalis application:
 *      i. Updates the ACRFD application features and meta to match whatever is in Tantalis (the source of truth).
 */

// winston logger needs to be created before any local classes that use the logger are loaded.
const winston = require('winston');
const defaultLog = winston.loggers.add('default', {
  transports: [
    new winston.transports.Console({
      level: 'silly'
    })
  ]
});

var Promise = require('es6-promise').Promise;
var _ = require('lodash');
var request = require('request');
var querystring = require('querystring');
var moment = require('moment');
var Utils = require('../../api/helpers/utils');
var Actions = require('../../api/helpers/actions');
var username = '';
var password = '';
var protocol = 'http';
var host = 'localhost';
var port = '3000';
var uri = '';
var client_id = '';
var grant_type = '';
var auth_endpoint = 'http://localhost:3000/api/login/token';
var _accessToken = '';

var args = process.argv.slice(2);
defaultLog.info('=======================================================');
if (args.length !== 8) {
  defaultLog.info(
    'Please specify proper parameters: <username> <password> <protocol> <host> <port> <client_id> <grant_type> <auth_endpoint>'
  );
  defaultLog.info('Example: node updateShapes.js admin admin http localhost 3000 client_id grant_type auth_endpoint');
  defaultLog.info('=======================================================');
  process.exit(1);
  return;
} else {
  username = args[0];
  password = args[1];
  protocol = args[2];
  host = args[3];
  port = args[4];
  client_id = args[5];
  grant_type = args[6];
  auth_endpoint = args[7];
  uri = protocol + '://' + host + ':' + port + '/';
  defaultLog.info('Using connection:', uri);
  defaultLog.info('-----------------------------------------------');
}

// Used when unpublishing retired applications.
var retiredStatuses = [
  'ABANDONED',
  'CANCELLED',
  'OFFER NOT ACCEPTED',
  'OFFER RESCINDED',
  'RETURNED',
  'REVERTED',
  'SOLD',
  'SUSPENDED',
  'WITHDRAWN',
  'ACTIVE',
  'COMPLETED',
  'DISPOSITION IN GOOD STANDING',
  'EXPIRED',
  'HISTORIC',
  'DISALLOWED'
];

// Used to renew the ACRFD login tokes before it expires if the update script takes longer than the lifespan of the token.
var jwt_login = null; // the ACRFD login token
var jwt_expiry = null; // how long the token lasts before expiring
var jwt_login_time = null; // time we last logged in

/**
 * Logs in to ACRFD.
 *
 * @param {String} username
 * @param {String} password
 * @returns {Promise} promise that resolves with the jwt_login token.
 */
var loginToACRFD = function(username, password) {
  return new Promise(function(resolve, reject) {
    var body = querystring.stringify({
      grant_type: grant_type,
      client_id: client_id,
      username: username,
      password: password
    });
    var contentLength = body.length;
    request.post(
      {
        url: auth_endpoint,
        headers: {
          'Content-Length': contentLength,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body
      },
      function(err, res, body) {
        if (err || res.statusCode !== 200) {
          defaultLog.info(' - Login err:', err, res);
          reject(null);
        } else {
          var data = JSON.parse(body);
          jwt_login = data.access_token;
          jwt_expiry = data.expires_in;
          jwt_login_time = moment();
          resolve(data.access_token);
        }
      }
    );
  });
};

/**
 * Gets an application from ACRFD.
 *
 * @param {String} route the api route to call in the form: 'api/some/route'. (required)
 * @param {number} batchNumber the pagination page to return, starting at 0. (optional)
 * @param {number} batchSize the number of applications per page. (optional)
 * @returns {Promise} promise that resolves with an array of applications.
 */
var getApplicationByID = function(route, tantalisID) {
  return new Promise(function(resolve, reject) {
    // only update the ones that aren't deleted
    const url = uri + route + '?fields=tantalisID&isDeleted=false&tantalisId=' + tantalisID;
    request.get(
      {
        url: url,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + jwt_login
        }
      },
      function(err, res, body) {
        if (err) {
          defaultLog.info(' - getApplication err:', err);
          reject(err);
        } else if (res.statusCode !== 200) {
          defaultLog.info('res.statusCode:', res.statusCode);
          reject(res.statusCode + ' ' + body);
        } else {
          var obj = {};
          try {
            obj = JSON.parse(body);
            resolve(obj);
          } catch (e) {
            defaultLog.info(' - getApplication parse err:', e);
          }
        }
      }
    );
  });
};

/**
 * Deletes the existing application features.
 *
 * @param {Application} acrfdApp Application
 * @returns {Promise}
 */
var deleteAllApplicationFeatures = function(acrfdApp) {
  return new Promise(function(resolve, reject) {
    request.delete(
      {
        url: uri + 'api/feature?applicationID=' + acrfdApp._id,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + jwt_login
        }
      },
      function(err, res, body) {
        if (err || res.statusCode !== 200) {
          defaultLog.info(' - deleteAllApplicationFeatures err:', err, res.body);
          reject(null);
        } else {
          var data = JSON.parse(body);
          resolve(data);
        }
      }
    );
  });
};

/**
 * Renews the jwt_login token if token expires soon.
 *
 * @returns {Promise}
 */
var renewJWTLogin = function() {
  return new Promise(function(resolve, reject) {
    var duration = moment.duration(moment().diff(jwt_login_time)).asSeconds();
    // if less than 60 seconds left before token expiry.
    if (duration > jwt_expiry - 60) {
      defaultLog.info(' - Requesting new ACRFD login token.');
      return loginToACRFD(username, password).then(function() {
        resolve();
      });
    } else {
      resolve();
    }
  });
};

/**
 * Updates and saves the application features.
 *
 * @param {Application} acrfdApp application as it exists in ACRFD
 * @param {Application} tantalisApp application with the latest values from Tantalis
 * @returns {Promise} promise that resolves wih the updated ACRFD application
 */
var updateFeatures = function(acrfdApp, tantalisApp) {
  return new Promise(function(resolve, reject) {
    // defaultLog.info("returning:", tantalisApp);
    // Store the features in the DB
    var allFeaturesForDisp = [];
    acrfdApp.areaHectares = tantalisApp.areaHectares;

    var turf = require('@turf/turf');
    var helpers = require('@turf/helpers');
    var centroids = helpers.featureCollection([]);
    _.each(tantalisApp.parcels, function(f) {
      // Tags default public
      f.tags = [['sysadmin'], ['public']];
      // copy in all the app meta just to stay consistent.
      f.properties.RESPONSIBLE_BUSINESS_UNIT = tantalisApp.RESPONSIBLE_BUSINESS_UNIT;
      f.properties.TENURE_PURPOSE = tantalisApp.TENURE_PURPOSE;
      f.properties.TENURE_SUBPURPOSE = tantalisApp.TENURE_SUBPURPOSE;
      f.properties.TENURE_STATUS = tantalisApp.TENURE_STATUS;
      f.properties.TENURE_TYPE = tantalisApp.TENURE_TYPE;
      f.properties.TENURE_STAGE = tantalisApp.TENURE_STAGE;
      f.properties.TENURE_SUBTYPE = tantalisApp.TENURE_SUBTYPE;
      f.properties.TENURE_LOCATION = tantalisApp.TENURE_LOCATION;
      f.properties.DISPOSITION_TRANSACTION_SID = tantalisApp.DISPOSITION_TRANSACTION_SID;
      f.properties.CROWN_LANDS_FILE = tantalisApp.CROWN_LANDS_FILE;

      allFeaturesForDisp.push(f);
      // Get the polygon and put it for later centroid calculation
      centroids.features.push(turf.centroid(f));
    });
    // Centroid of all the shapes.
    if (centroids.features.length > 0) {
      acrfdApp.centroid = turf.centroid(centroids).geometry.coordinates;
    }
    acrfdApp.client = '';
    for (let [idx, client] of Object.entries(tantalisApp.interestedParties)) {
      if (idx > 0) {
        acrfdApp.client += ', ';
      }
      if (client.interestedPartyType == 'O') {
        acrfdApp.client += client.legalName;
      } else {
        acrfdApp.client += client.firstName + ' ' + client.lastName;
      }
    }
    acrfdApp.statusHistoryEffectiveDate = tantalisApp.statusHistoryEffectiveDate;

    Promise.resolve()
      .then(function() {
        return allFeaturesForDisp.reduce(function(previousFeature, currentFeature) {
          return previousFeature.then(function() {
            return saveFeatures(currentFeature, acrfdApp._id);
          });
        }, Promise.resolve());
      })
      .then(function() {
        resolve(acrfdApp);
      });
  });
};

/**
 * Saves the application features.
 *
 * @param {Application} feature Application feature
 * @param {String} acrfdAppId Application id
 * @returns {Promise}
 */
var saveFeatures = function(feature, acrfdAppId) {
  return new Promise(function(resolve, reject) {
    feature.applicationID = acrfdAppId;
    request.post(
      {
        url: uri + 'api/feature',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + jwt_login
        },
        body: JSON.stringify(feature)
      },
      function(err, res, body) {
        if (err || res.statusCode !== 200) {
          defaultLog.info(' - doFeatureSave err:', err, res);
          reject(null);
        } else {
          var data = JSON.parse(body);
          resolve(data);
        }
      }
    );
  });
};

/**
 * Updates and saves the ACRFD application meta.
 *
 * @param {Application} acrfdApp
 * @param {Object} tantalisApp
 * @returns
 */
var updateApplicationMeta = function(acrfdApp, tantalisApp) {
  return new Promise(function(resolve, reject) {
    var updatedAppObject = {};
    updatedAppObject.businessUnit = tantalisApp.RESPONSIBLE_BUSINESS_UNIT;
    updatedAppObject.purpose = tantalisApp.TENURE_PURPOSE;
    updatedAppObject.subpurpose = tantalisApp.TENURE_SUBPURPOSE;
    updatedAppObject.status = tantalisApp.TENURE_STATUS;
    updatedAppObject.type = tantalisApp.TENURE_TYPE;
    updatedAppObject.tenureStage = tantalisApp.TENURE_STAGE;
    updatedAppObject.subtype = tantalisApp.TENURE_SUBTYPE;
    updatedAppObject.location = tantalisApp.TENURE_LOCATION;
    updatedAppObject.legalDescription = tantalisApp.TENURE_LEGAL_DESCRIPTION;
    updatedAppObject.centroid = acrfdApp.centroid;
    updatedAppObject.areaHectares = acrfdApp.areaHectares;
    updatedAppObject.client = acrfdApp.client;
    updatedAppObject.statusHistoryEffectiveDate = acrfdApp.statusHistoryEffectiveDate;

    request.put(
      {
        url: uri + 'api/application/' + acrfdApp._id,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + jwt_login
        },
        body: JSON.stringify(updatedAppObject)
      },
      function(err, res, body) {
        if (err || res.statusCode !== 200) {
          defaultLog.info(' - updateApplicationMeta err:', err, res);
          reject(null);
        } else {
          var data = JSON.parse(body);
          resolve(data);
        }
      }
    );
  });
};

/**
 * Given an ACRFD applications tantalisID (disposition ID), makes all necessary calls to update it with the latest information from Tantalis.
 *
 * @param {string} applicationIDToUpdate a tantalisID
 * @returns {Promise}
 */
var updateApplication = function(applicationIDToUpdate) {
  return renewJWTLogin()
    .then(function() {
      return getApplicationByID('api/application', applicationIDToUpdate);
    })
    .then(function(applicationsToUpdate) {
      // Only expecting 1 result, but the API returns an array
      return applicationsToUpdate.reduce(function(previousApp, currentApp) {
        return previousApp.then(function() {
          defaultLog.info('-----------------------------------------------');
          defaultLog.info(`6. Updating ACRFD Application, tantalisID: ${currentApp.tantalisID}`);
          defaultLog.info(' - Fetching Tantalis application');
          return Utils.getApplicationByDispositionID(_accessToken, currentApp.tantalisID).then(function(tantalisApp) {
            if (!tantalisApp) {
              defaultLog.info(' - No Tantalis application found - not updating.');
              return Promise.resolve();
            }
            defaultLog.info(' - Deleting existing application features');
            return deleteAllApplicationFeatures(currentApp)
              .then(function() {
                defaultLog.info(' - Updating new application features');
                return updateFeatures(currentApp, tantalisApp);
              })
              .then(function(updatedApp) {
                defaultLog.info(' - Updating new application meta');
                return updateApplicationMeta(updatedApp, tantalisApp);
              });
          });
        });
      }, Promise.resolve());
    });
};

/**
 * Fetches all ACRFD applications that have a retired status AND a statusHistoryEffectiveDate within the past 2 weeks 6 months ago.
 *
 * @returns {Promise} promise that resolves with the list of retired applications.
 */
var getApplicationsToUnpublish = function() {
  defaultLog.info(' - fetching retired applications.');
  return new Promise(function(resolve, reject) {
    var sinceDate = moment()
      .subtract(6, 'months')
      .subtract(2, 'weeks');
    var untilDate = moment().subtract(6, 'months');

    // get all applications that are in a retired status, and that have a last status update date within in the past week 6 months ago.
    var queryString = `?statusHistoryEffectiveDate[since]=${sinceDate.toISOString()}&statusHistoryEffectiveDate[until]=${untilDate.toISOString()}`;
    retiredStatuses.forEach(status => (queryString += `&status[eq]=${encodeURIComponent(status)}`));

    request.get(
      {
        url: uri + 'api/application' + queryString,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + jwt_login
        }
      },
      function(err, res, body) {
        if (err || res.statusCode !== 200) {
          defaultLog.info(' - getApplicationsToUnpublish err:', err, res);
          reject(null);
        } else {
          var data = JSON.parse(body);

          // only return applications that are currently published
          var appsToUnpublish = _.filter(data, app => {
            return Actions.isPublished(app);
          });
          resolve(appsToUnpublish);
        }
      }
    );
  });
};

/**
 * Unpublishes ACRFD applications.
 *
 * @param {*} applicationsToUnpublish array of applications
 * @returns {Promise}
 */
var unpublishApplications = function(applicationsToUnpublish) {
  return applicationsToUnpublish.reduce(function(previousApp, currentApp) {
    return previousApp.then(function() {
      return new Promise(function(resolve, reject) {
        request.put(
          {
            url: uri + 'api/application/' + currentApp._id + '/unpublish',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + jwt_login
            },
            body: JSON.stringify(currentApp)
          },
          function(err, res, body) {
            if (err || res.statusCode !== 200) {
              defaultLog.info(' - unpublishApplications err:', err, body);
              reject(null);
            } else {
              defaultLog.info(` - Unpublished application, _id: ${currentApp._id}`);
              var data = JSON.parse(body);
              resolve(data);
            }
          }
        );
      });
    });
  }, Promise.resolve());
};

/**
 * Gets all non-deleted ACRFD application tantalis IDs.
 *
 * @returns {Promise} promise that resolves with an array of ACRFD application tantalisIDs.
 */
var getAllApplicationIDs = function() {
  return new Promise(function(resolve, reject) {
    // only update the ones that aren't deleted
    const url = uri + 'api/application/' + '?fields=tantalisID&isDeleted=false';
    request.get(
      {
        url: url,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + jwt_login
        }
      },
      function(err, res, body) {
        if (err) {
          defaultLog.info(' - getAllApplicationIDs err:', err);
          reject(err);
        } else if (res.statusCode !== 200) {
          defaultLog.info('res.statusCode:', res.statusCode);
          reject(res.statusCode + ' ' + body);
        } else {
          var obj = {};
          try {
            obj = JSON.parse(body);
            resolve(obj);
          } catch (e) {
            defaultLog.info(' - getAllApplicationIDs parse err:', e);
          }
        }
      }
    );
  });
};

/**
 *  Main call chain that utilizes the above functions to update ACRFD applications.
 */
defaultLog.info('1. Authenticating with ACRFD.');
loginToACRFD(username, password)
  .then(function() {
    defaultLog.info('-----------------------------------------------');
    defaultLog.info('2. Unpublishing retired applications.');
    return getApplicationsToUnpublish().then(function(applicationsToUnpublish) {
      defaultLog.info(` - found ${applicationsToUnpublish.length} retired applications.`);
      return unpublishApplications(applicationsToUnpublish);
    });
  })
  .then(function() {
    defaultLog.info('-----------------------------------------------');
    defaultLog.info('3. Authenticating with Tantalis.');
    return Utils.loginWebADE().then(function(accessToken) {
      defaultLog.info(' - TTLS API login token:', accessToken);
      _accessToken = accessToken;
      return _accessToken;
    });
  })
  .then(function() {
    defaultLog.info('-----------------------------------------------');
    defaultLog.info('4. Fetching all Tantalis applications that have been updated in the last week.');
    var lastWeek = moment()
      .subtract(1, 'week')
      .format('YYYYMMDD');
    return Utils.getAllApplicationIDs(_accessToken, { updated: lastWeek });
  })
  .then(function(recentlyUpdatedApplicationIDs) {
    defaultLog.info('-----------------------------------------------');
    defaultLog.info(
      '5. Fetching all non-deleted ACRFD applications and cross referencing with recently updated Tantalis applications.'
    );
    return getAllApplicationIDs().then(function(allACRFDApplicationIDs) {
      return allACRFDApplicationIDs
        .map(app => app.tantalisID)
        .filter(tantalisID => recentlyUpdatedApplicationIDs.includes(tantalisID));
    });
  })
  .then(function(applicationIDsToUpdate) {
    defaultLog.info(
      ` - Found ${
        applicationIDsToUpdate.length
      } ACRFD Applications with matching recently updated Tantalis application.`
    );
    // For each ACRFD application with a matching recently updated application from Tantalis, fetch the matching record in ACRFD and update it
    return applicationIDsToUpdate.reduce(function(previousItem, currentItem) {
      return previousItem.then(function() {
        // Each iteration, check if the ACRFD login token needs to be re-fetched
        return updateApplication(currentItem);
      });
    }, Promise.resolve());
  })
  .then(function() {
    defaultLog.info('-----------------------------------------------');
    defaultLog.info('Done!');
    defaultLog.info('=======================================================');
  })
  .catch(function(err) {
    defaultLog.info('-----------------------------------------------');
    defaultLog.info(' - General err:', err);
    defaultLog.info('=======================================================');
    process.exit(1);
  });
