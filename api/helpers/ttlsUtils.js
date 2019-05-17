'use strict';

/**
 * This file contains various utility functions for working with Tantalis and Tantalis data.
 */

const _ = require('lodash');
const mongoose = require('mongoose');
const qs = require('qs');
const request = require('request');
const turf = require('@turf/turf');
const helpers = require('@turf/helpers');
const spatialUtils = require('./spatialUtils');
const defaultLog = require('winston').loggers.get('default');

let tantalisAPI = process.env.TTLS_API_ENDPOINT || 'https://api.nrs.gov.bc.ca/ttls-api/v1/';
let webADEAPI = process.env.WEBADE_AUTH_ENDPOINT || 'https://api.nrs.gov.bc.ca/oauth2/v1/';
let username = process.env.WEBADE_USERNAME || 'TTLS-EXT';
let password = process.env.WEBADE_PASSWORD || 'nT00kQd79hvhCSoAqLmh';

// WebADE Login
exports.loginWebADE = function() {
  // Login to webADE and return access_token for use in subsequent calls.
  return new Promise(function(resolve, reject) {
    request.get(
      {
        url: webADEAPI + 'oauth/token?grant_type=client_credentials&disableDeveloperFilter=true',
        headers: {
          Authorization: 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
        }
      },
      function(err, res, body) {
        if (err) {
          defaultLog.error('WebADE Login Error:', err);
          reject(err);
        } else if (res && res.statusCode !== 200) {
          defaultLog.info('WebADE Login ResponseCode:', res.statusCode);
          reject({ code: (res && res.statusCode) || null });
        } else {
          try {
            var obj = JSON.parse(body);
            if (obj && obj.access_token) {
              resolve(obj.access_token);
            } else {
              reject();
            }
          } catch (e) {
            defaultLog.error('WebADE Login Error:', e);
            reject(e);
          }
        }
      }
    );
  });
};

// Tantalis API
exports.getApplicationByFilenumber = function(accessToken, clFile) {
  return new Promise(function(resolve, reject) {
    defaultLog.info('Looking up file:', tantalisAPI + 'landUseApplications?fileNumber=' + clFile);
    request.get(
      {
        url: tantalisAPI + 'landUseApplications?fileNumber=' + clFile,
        auth: {
          bearer: accessToken
        }
      },
      function(err, res, body) {
        if (err) {
          defaultLog.error('TTLS API Error:', err);
          reject(err);
        } else if (res && res.statusCode !== 200) {
          defaultLog.info('TTLS API ResponseCode:', res.statusCode);
          reject({ code: (res && res.statusCode) || null });
        } else {
          try {
            var obj = JSON.parse(body);
            // defaultLog.info("obj:", obj);
            var applications = [];
            if (obj && obj.elements && obj.elements.length > 0) {
              // defaultLog.info("obj.elements:", obj.elements);
              for (let app of obj.elements) {
                // defaultLog.info("app:", app);
                var application = {};
                application.TENURE_PURPOSE = app.purposeCode['description'];
                application.TENURE_SUBPURPOSE = app.purposeCode.subPurposeCodes[0]['description'];
                application.TENURE_TYPE = app.landUseTypeCode['description'];
                application.TENURE_SUBTYPE = app.landUseTypeCode.landUseSubTypeCodes[0]['description'];
                application.TENURE_STATUS = app.statusCode['description'];
                application.TENURE_STAGE = app.stageCode['description'];
                application.TENURE_LOCATION = app.locationDescription;
                application.RESPONSIBLE_BUSINESS_UNIT = app.businessUnit.name;
                application.CROWN_LANDS_FILE = app.fileNumber;
                application.DISPOSITION_TRANSACTION_SID = app.landUseApplicationId;
                applications.push(application);
              }
            } else {
              defaultLog.info('No results found.');
            }
            resolve(applications);
          } catch (e) {
            defaultLog.error('Object Parsing Failed:', e);
            reject(e);
          }
        }
      }
    );
  });
};

/**
 * Fetches an application by its disposition ID.
 *
 * @param {string} accessToken tantalis bearer token
 * @param {string} disp disposition ID
 * @returns {Promise} promise that resolves with a single application
 */
exports.getApplicationByDispositionID = function(accessToken, disp) {
  return new Promise(function(resolve, reject) {
    defaultLog.info('Looking up disposition:', tantalisAPI + 'landUseApplications/' + disp);
    request.get(
      {
        url: tantalisAPI + 'landUseApplications/' + disp,
        auth: {
          bearer: accessToken
        }
      },
      function(err, res, body) {
        if (err) {
          defaultLog.error('TTLS API Error:', err);
          reject(err);
        } else if (res && res.statusCode !== 200) {
          defaultLog.info('TTLS API ResponseCode:', res.statusCode);
          reject({ code: (res && res.statusCode) || null });
        } else {
          try {
            var obj = JSON.parse(body);
            var application = {};
            if (obj) {
              // Setup the application object.
              application.TENURE_PURPOSE = obj.purposeCode['description'];
              application.TENURE_SUBPURPOSE = obj.purposeCode.subPurposeCodes[0]['description'];
              application.TENURE_TYPE = obj.landUseTypeCode['description'];
              application.TENURE_SUBTYPE = obj.landUseTypeCode.landUseSubTypeCodes[0]['description'];
              application.TENURE_STATUS = obj.statusCode['description'];
              application.TENURE_STAGE = obj.stageCode['description'];
              application.TENURE_LOCATION = obj.locationDescription;
              application.RESPONSIBLE_BUSINESS_UNIT = obj.businessUnit.name;
              application.CROWN_LANDS_FILE = obj.fileNumber;
              application.DISPOSITION_TRANSACTION_SID = disp;
              application.parcels = [];
              application.interestedParties = [];
              application.statusHistoryEffectiveDate =
                obj.statusHistory[0] != null
                  ? new Date(obj.statusHistory[0].effectiveDate) // convert Unix Epoch Time (ms)
                  : null;

              // WKT conversion to GEOJSON
              for (let geo of obj.interestParcels) {
                if (geo.wktGeometry) {
                  var feature = {};
                  feature.TENURE_LEGAL_DESCRIPTION = geo.legalDescription;
                  feature.TENURE_AREA_IN_HECTARES = geo.areaInHectares;
                  feature.INTRID_SID = geo.interestParcelId;
                  feature.FEATURE_CODE = geo.featureCode;
                  feature.FEATURE_AREA_SQM = geo.areaInSquareMetres;
                  feature.FEATURE_LENGTH_M = geo.areaLengthInMetres;
                  feature.TENURE_EXPIRY = geo.expiryDate;

                  var crs = {};
                  crs.properties = {};
                  crs.properties.name = 'urn:ogc:def:crs:EPSG::4326';

                  const geometryArray = spatialUtils.getGeometryArray(geo);

                  geometryArray.forEach(geometry => {
                    application.parcels.push({
                      type: 'Feature',
                      geometry: geometry,
                      properties: feature,
                      crs: crs
                    });
                  });
                }
              }

              // Calculate areaHectares, prepare centroid calculation
              var centroids = helpers.featureCollection([]);
              application.areaHectares = 0.0;
              _.each(application.parcels, function(f) {
                // Get the polygon and put it for later centroid calculation
                if (f.geometry) {
                  centroids.features.push(turf.centroid(f));
                }
                if (f.properties && f.properties.TENURE_AREA_IN_HECTARES) {
                  application.areaHectares += parseFloat(f.properties.TENURE_AREA_IN_HECTARES);
                }
              });
              // Centroid of all the shapes.
              if (centroids.features.length > 0) {
                application.centroid = turf.centroid(centroids).geometry.coordinates;
              }

              // Interested Parties
              for (let party of obj.interestedParties) {
                var partyObj = {};
                partyObj.interestedPartyType = party.interestedPartyType;

                if (party.interestedPartyType == 'I') {
                  partyObj.firstName = party.individual.firstName;
                  partyObj.lastName = party.individual.lastName;
                } else {
                  // party.interestedPartyType == 'O'
                  partyObj.legalName = party.organization.legalName;
                  partyObj.divisionBranch = party.organization.divisionBranch;
                }
                // Check if we've already added this.
                if (!_.includes(application.interestedParties, partyObj)) {
                  application.interestedParties.push(partyObj);
                }
              }
              resolve(application);
            } else {
              defaultLog.info('Nothing found.');
              resolve(null);
            }
          } catch (e) {
            defaultLog.error('Object Parsing Failed:', e);
            reject(e);
          }
        }
      }
    );
  });
};

/**
 * Fetches all application landUseApplicationIds (aka: dispositionID, tantalisID) from Tantalis given the filter params provided.
 *
 * @param {string} accessToken Tantalis API access token. (required)
 * @param {object} [filterParams={}] Object containing Tantalis query filters. See Tantalis API Spec. (optional)
 * @returns an array of matching Tantalis IDs.
 */
exports.getAllApplicationIDs = function(accessToken, filterParams = {}) {
  return new Promise(function(resolve, reject) {
    const queryString = `?${qs.stringify(filterParams)}`;

    defaultLog.info('Looking up all applications:', tantalisAPI + 'landUseApplications' + queryString);

    request.get(
      {
        url: tantalisAPI + 'landUseApplications' + queryString,
        auth: {
          bearer: accessToken
        }
      },
      function(err, res, body) {
        if (err) {
          defaultLog.error('TTLS API Error:', err);
          reject(err);
        } else if (res && res.statusCode !== 200) {
          defaultLog.info('TTLS API ResponseCode:', res.statusCode);
          reject({ code: (res && res.statusCode) || null });
        } else {
          try {
            var response = JSON.parse(body);

            var applicationIDs = [];
            _.forEach(response.elements, function(obj) {
              if (obj) {
                applicationIDs.push(obj.landUseApplicationId);
              }
            });

            if (!applicationIDs.length) {
              defaultLog.info('No applications found.');
              resolve([]);
            }

            resolve(applicationIDs);
          } catch (e) {
            defaultLog.error('Object Parsing Failed:', e);
            reject(e);
          }
        }
      }
    );
  });
};

/**
 * Given an ACRFD applications tantalisID (disposition ID), makes all necessary calls to update it with the latest information from Tantalis.
 *
 * @param {string} applicationToUpdate an Application
 * @param {string} ttlsAccessToken a tantalis api bearer token
 * @returns {Promise}
 */
exports.updateApplication = function(applicationToUpdate) {
  return this.loginWebADE().then(ttlsAccessToken => {
    return this.getApplicationByDispositionID(ttlsAccessToken, applicationToUpdate.tantalisID).then(tantalisApp => {
      if (!tantalisApp) {
        defaultLog.warn('updateApplication - no Tantalis application found - not updating.');
        return Promise.resolve();
      }

      return deleteAllApplicationFeatures(applicationToUpdate)
        .then(() => {
          return updateFeatures(applicationToUpdate, tantalisApp);
        })
        .then(updatedApp => {
          return updateApplicationMeta(updatedApp, tantalisApp);
        });
    });
  });
};

/**
 * Deletes the existing application features.
 *
 * @param {Application} applicationObjectID Application ObjectID
 * @returns {Promise}
 */
const deleteAllApplicationFeatures = function(applicationObjectID) {
  return new Promise(function(resolve, reject) {
    const featureModel = mongoose.model('Feature');
    featureModel.deleteOne({ applicationID: applicationObjectID }, function(error, data) {
      if (error) {
        defaultLog.error('deleteAllApplicationFeatures:', error);
        reject(error);
      }

      resolve(data);
    });
  });
};

/**
 * Updates and saves the application features.
 *
 * @param {Application} acrfdApp application as it exists in ACRFD
 * @param {Application} tantalisApp application with the latest values from Tantalis
 * @returns {Promise} promise that resolves wih the updated ACRFD application
 */
const updateFeatures = function(acrfdApp, tantalisApp) {
  return new Promise(function(resolve, reject) {
    // defaultLog.info("returning:", tantalisApp);
    // Store the features in the DB
    let allFeaturesForDisp = [];
    acrfdApp.areaHectares = tantalisApp.areaHectares;

    let turf = require('@turf/turf');
    let helpers = require('@turf/helpers');

    let centroids = helpers.featureCollection([]);
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
            return saveFeature(currentFeature, acrfdApp._id);
          });
        }, Promise.resolve());
      })
      .then(function() {
        resolve(acrfdApp);
      });
  });
};

/**
 * Creates a feature.
 *
 * @param {Feature} feature Feature object
 * @param {String} acrfdapplicationObjectIDAppId Application ObjectID
 * @returns {Promise}
 */
const saveFeature = function(feature, applicationObjectID) {
  return new Promise(function(resolve, reject) {
    feature.applicationID = applicationObjectID;

    // Define security tag defaults.  Default public and sysadmin.
    feature.tags = [['sysadmin'], ['public']];

    var featureModel = require('mongoose').model('Feature');
    featureModel.create([feature], { upsert: false, new: true }, function(error, updatedFeature) {
      if (error) {
        defaultLog.error('saveFeature:', error);
        reject(error);
      }

      resolve(updatedFeature);
    });
  });
};

/**
 * Updates and saves the ACRFD application meta.
 *
 * @param {Application} acrfdApp
 * @param {Object} tantalisApp
 * @returns
 */
const updateApplicationMeta = function(acrfdApp, tantalisApp) {
  return new Promise(function(resolve, reject) {
    let updatedAppObject = {};
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

    const ApplicationModel = mongoose.model('Application');
    ApplicationModel.findOneAndUpdate({ _id: acrfdApp._id }, updatedAppObject, function(error, updatedApp) {
      if (error) {
        defaultLog.error('updateApplicationMeta:', error);
        reject(error);
      }

      resolve(updatedApp);
    });
  });
};
