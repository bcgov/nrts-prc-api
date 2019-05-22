/**
 * This script performs various updates to ACRFD applications in order to keep them up to date with whatever information is in Tantalis (the source of truth).
 *
 * 1. Authenticates with ACRFD
 * 2. Unpublishes retired applications:
 *    a. Fetches all ACRFD applications that have reached a retired state (assumes 6 months is the retirement period), and unpublishes any found.
 * 3. AUthenticates with Tantalis
 * 4. Updates non-deleted ACRFD applications:
 *    a. Fetches all Tantalis applications that have had their status history effective date update within the last 1 week.
 *    b. Fetches all non-deleted ACRFD tantalisIDs.
 *    c. For each ACRFD application with a matching Tantalis application:
 *      i. Updates the ACRFD application features and meta to match whatever is in Tantalis (the source of truth).
 */

// winston logger needs to be created before any local classes that use the logger are loaded.
const defaultLog = require('../../api/helpers/logger');

var Promise = require('es6-promise').Promise;
var _ = require('lodash');
var request = require('request');
var querystring = require('querystring');
var moment = require('moment');
var TTLSUtils = require('../../api/helpers/ttlsUtils');
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
  defaultLog.error(
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
      function(error, res, body) {
        if (error) {
          defaultLog.error(' - loginToACRFD error:', error);
          reject(error);
        } else if (res.statusCode !== 200) {
          defaultLog.error(' - loginToACRFD error:', res.statusCode, body);
          reject(res.statusCode + ' ' + body);
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
 * Fetches all ACRFD applications that have a retired status AND a statusHistoryEffectiveDate older than 6 months ago.
 *
 * @returns {Promise} promise that resolves with the list of retired applications.
 */
var getApplicationsToUnpublish = function() {
  defaultLog.info(' - fetching retired applications.');
  return new Promise(function(resolve, reject) {
    var untilDate = moment().subtract(6, 'months');

    // get all applications that are in a retired status and that have a last status update date older than 6 months ago.
    var queryString = `?statusHistoryEffectiveDate[until]=${untilDate.toISOString()}`;
    retiredStatuses.forEach(status => (queryString += `&status[eq]=${encodeURIComponent(status)}`));

    request.get(
      {
        url: uri + 'api/application' + queryString,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + jwt_login
        }
      },
      function(error, res, body) {
        if (error) {
          defaultLog.error(' - getApplicationsToUnpublish error:', error);
          reject(error);
        } else if (res.statusCode !== 200) {
          defaultLog.error(' - getApplicationsToUnpublish error:', res.statusCode, body);
          reject(res.statusCode + ' ' + body);
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
          function(error, res, body) {
            if (error) {
              defaultLog.error(' - unpublishApplications error:', error);
              reject(error);
            } else if (res.statusCode !== 200) {
              defaultLog.error(' - unpublishApplications error:', res.statusCode, body);
              reject(res.statusCode + ' ' + body);
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
 * Updates an ACRFD applications features and meta with the latest data from Tantalis.
 *
 * @param {string} acrfdAppID Application _id.
 * @returns {Promise}
 */
const updateACRFDApplication = function(acrfdAppID) {
  return new Promise(function(resolve, reject) {
    // only update the ones that aren't deleted
    const url = uri + `api/application/${acrfdAppID}/refresh`;
    request.put(
      {
        url: url,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + jwt_login
        }
      },
      function(error, res, body) {
        if (error) {
          defaultLog.error(' - updateACRFDApplication error:', error);
          reject(error);
        } else if (res.statusCode !== 200) {
          defaultLog.error(' - updateACRFDApplication error:', res.statusCode, body);
          reject(res.statusCode + ' ' + body);
        } else {
          var obj = {};
          try {
            obj = JSON.parse(body);
            resolve(obj);
          } catch (e) {
            defaultLog.info(' - updateACRFDApplication parse error:', e);
          }
        }
      }
    );
  });
};

/**
 * Gets all non-deleted ACRFD applications.
 *
 * Note: Only returns _id and tantalisID fields.
 *
 * @returns {Promise} promise that resolves with an array of ACRFD applications.
 */
var getAllACRFDApplicationIDs = function() {
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
      function(error, res, body) {
        if (error) {
          defaultLog.error(' - getAllACRFDApplicationIDs error:', error);
          reject(error);
        } else if (res.statusCode !== 200) {
          defaultLog.error(' - getAllACRFDApplicationIDs error:', res.statusCode, body);
          reject(res.statusCode + ' ' + body);
        } else {
          var obj = {};
          try {
            obj = JSON.parse(body);
            resolve(obj);
          } catch (e) {
            defaultLog.info(' - getAllACRFDApplicationIDs parse error:', e);
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
    return TTLSUtils.loginWebADE().then(function(accessToken) {
      defaultLog.info(' - TTLS API login token:', accessToken);
      _accessToken = accessToken;
      return _accessToken;
    });
  })
  .then(function() {
    defaultLog.info('-----------------------------------------------');
    defaultLog.info(
      '4. Fetching all Tantalis applications that have had their status history effective date updated in the last week.'
    );
    var lastWeek = moment()
      .subtract(1, 'week')
      .format('YYYYMMDD');
    return TTLSUtils.getAllApplicationIDs(_accessToken, { updated: lastWeek });
  })
  .then(function(recentlyUpdatedApplicationIDs) {
    defaultLog.info('-----------------------------------------------');
    defaultLog.info(
      '5. Fetching all non-deleted ACRFD applications and cross referencing with recently updated Tantalis applications.'
    );
    return getAllACRFDApplicationIDs().then(function(allACRFDApplicationIDs) {
      return allACRFDApplicationIDs
        .filter(acrfdApp => recentlyUpdatedApplicationIDs.includes(acrfdApp.tantalisID))
        .map(acrfdApp => acrfdApp._id);
    });
  })
  .then(function(applicationIDsToUpdate) {
    defaultLog.info(
      ` - Found ${
        applicationIDsToUpdate.length
      } ACRFD Applications with a matching recently updated Tantalis application.`
    );
    // For each ACRFD application with a matching recently updated application from Tantalis, fetch the matching record in ACRFD and update it
    return applicationIDsToUpdate.reduce(function(previousItem, currentItem) {
      return previousItem.then(function() {
        defaultLog.info('-----------------------------------------------');
        defaultLog.info(`6. Updating ACRFD Application, _id: ${currentItem}`);
        // Each iteration, check if the ACRFD login token is nearly expired and needs to be re-fetched
        return renewJWTLogin().then(function() {
          return updateACRFDApplication(currentItem);
        });
      });
    }, Promise.resolve());
  })
  .then(function() {
    defaultLog.info('-----------------------------------------------');
    defaultLog.info('Done!');
    defaultLog.info('=======================================================');
  })
  .catch(function(error) {
    defaultLog.error('-----------------------------------------------');
    defaultLog.error(' - General error:', error);
    defaultLog.error('=======================================================');
    process.exit(1);
  });
