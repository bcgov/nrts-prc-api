const _ = require('lodash');
const mongoose = require('mongoose');
const defaultLog = require('winston').loggers.get('default');

const Utils = require('../../api/helpers/utils');

/**
 * Given an ACRFD applications tantalisID (disposition ID), makes all necessary calls to update it with the latest information from Tantalis.
 *
 * @param {string} applicationToUpdate an Application
 * @param {string} ttlsAccessToken a tantalis api bearer token
 * @returns {Promise}
 */
exports.updateApplication = function(applicationToUpdate) {
  return Utils.loginWebADE().then(ttlsAccessToken => {
    return Utils.getApplicationByDispositionID(ttlsAccessToken, applicationToUpdate.tantalisID).then(tantalisApp => {
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