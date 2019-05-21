const test_helper = require('./test_helper');
const app = test_helper.app;
const mongoose = require('mongoose');
const request = require('supertest');
const fieldNames = [];
const TTLSUtils = require('../helpers/ttlsUtils');

function publicParamsWithDtId(req) {
  let params = test_helper.buildParams({ dtId: req.params.id });
  return test_helper.createPublicSwaggerParams(fieldNames, params);
}

const searchController = require('../controllers/search.js');
require('../helpers/models/application');
require('../helpers/models/feature');
const Feature = mongoose.model('Feature');

app.get('/api/search/ttlsapi/crownLandFileNumber/:id', function(req, res) {
  let extraFields = test_helper.buildParams({ fileNumber: req.params.id });
  let params = test_helper.createSwaggerParams(fieldNames, extraFields);
  return searchController.protectedTTLSGetApplicationsByFileNumber(params, res);
});

app.get('/api/search/ttlsapi/dispositionTransactionId/:id', function(req, res) {
  let extraFields = test_helper.buildParams({ dtId: req.params.id });
  let params = test_helper.createSwaggerParams(fieldNames, extraFields);
  return searchController.protectedTTLSGetApplicationByDisp(params, res);
});

app.get('/api/public/search/dispositionTransactionId/:id', function(req, res) {
  return searchController.publicGetDispositionTransactionId(publicParamsWithDtId(req), res);
});

describe('GET /api/search/ttlsapi/crownLandFileNumber/', () => {
  let clFileNumber = 555555;
  const firstResult = { DISPOSITION_TRANSACTION_SID: 111111 };
  const secondResult = { DISPOSITION_TRANSACTION_SID: 222222 };
  const dispSearchResult = {};

  describe('when the ttls api login call returns successfully', () => {
    let loginPromise = new Promise(function(resolve, reject) {
      resolve('ACCESS_TOKEN');
    });

    let appFileNumSearchPromise = new Promise(function(resolve, reject) {
      resolve([firstResult, secondResult]);
    });

    let appDispSearchPromise = new Promise(function(resolve, reject) {
      resolve(dispSearchResult);
    });

    beforeEach(() => {
      spyOn(TTLSUtils, 'loginWebADE').and.returnValue(loginPromise);

      spyOn(TTLSUtils, 'getApplicationByFilenumber').and.returnValue(appFileNumSearchPromise);

      spyOn(TTLSUtils, 'getApplicationByDispositionID').and.returnValue(appDispSearchPromise);
    });

    test('logs in and then searches TTLS by CLFileNumber with that access token', done => {
      request(app)
        .get('/api/search/ttlsapi/crownLandFileNumber/' + clFileNumber)
        .expect(200)
        .then(response => {
          expect(TTLSUtils.loginWebADE).toHaveBeenCalled();
          expect(TTLSUtils.getApplicationByFilenumber).toHaveBeenCalledWith('ACCESS_TOKEN', '555555');
          done();
        });
    });

    test('searches TTLS getApplicationByDispositionID once for each disp returned by the file number search', done => {
      request(app)
        .get('/api/search/ttlsapi/crownLandFileNumber/' + clFileNumber)
        .expect(200)
        .then(response => {
          expect(TTLSUtils.getApplicationByFilenumber).toHaveBeenCalledWith('ACCESS_TOKEN', '555555');

          expect(TTLSUtils.getApplicationByDispositionID).toHaveBeenCalledWith('ACCESS_TOKEN', 111111);
          expect(TTLSUtils.getApplicationByDispositionID).toHaveBeenCalledWith('ACCESS_TOKEN', 222222);

          done();
        });
    });

    test('returns the search results from each getAppliationByDispositionID call', done => {
      request(app)
        .get('/api/search/ttlsapi/crownLandFileNumber/' + clFileNumber)
        .expect(200)
        .then(response => {
          expect(response.body.length).toEqual(2);
          expect(response.body).toEqual([dispSearchResult, dispSearchResult]);

          done();
        });
    });
  });

  describe('when the ttls api login call fails', () => {
    let loginPromise = new Promise(function(resolve, reject) {
      reject({ statusCode: 503, message: 'Ooh boy something went wrong' });
    });

    beforeEach(() => {
      spyOn(TTLSUtils, 'loginWebADE').and.returnValue(loginPromise);
    });

    test('returns that error response', done => {
      request(app)
        .get('/api/search/ttlsapi/crownLandFileNumber/' + clFileNumber)
        .expect(503)
        .then(response => {
          expect(response.body.message).toEqual('Ooh boy something went wrong');
          done();
        });
    });
  });
});

describe('GET /api/search/ttlsapi/dispositionTransactionId/', () => {
  let dispositionId = 666666;
  const searchResult = {
    DISPOSITION_TRANSACTION_SID: 666666
  };

  describe('when the ttls api login call returns successfully', () => {
    let loginPromise = new Promise(function(resolve, reject) {
      resolve('ACCESS_TOKEN');
    });

    let appDispSearchPromise = new Promise(function(resolve, reject) {
      resolve(searchResult);
    });

    beforeEach(() => {
      spyOn(TTLSUtils, 'loginWebADE').and.returnValue(loginPromise);

      spyOn(TTLSUtils, 'getApplicationByDispositionID').and.returnValue(appDispSearchPromise);
    });

    test('logs in and then retrieves the application with that access token', done => {
      request(app)
        .get('/api/search/ttlsapi/dispositionTransactionId/' + dispositionId)
        .expect(200)
        .then(response => {
          expect(TTLSUtils.loginWebADE).toHaveBeenCalled();
          expect(TTLSUtils.getApplicationByDispositionID).toHaveBeenCalledWith('ACCESS_TOKEN', '666666');
          done();
        });
    });
  });

  describe('when the ttls api login call fails', () => {
    let loginPromise = new Promise(function(resolve, reject) {
      reject({ statusCode: 503, message: 'Ooh boy something went wrong' });
    });

    beforeEach(() => {
      spyOn(TTLSUtils, 'loginWebADE').and.returnValue(loginPromise);
    });

    test('returns that error response', done => {
      request(app)
        .get('/api/search/ttlsapi/dispositionTransactionId/' + dispositionId)
        .expect(503)
        .then(response => {
          expect(response.body.message).toEqual('Ooh boy something went wrong');
          done();
        });
    });
  });
});

describe('GET /api/public/search/dispositionTransactionId', () => {
  let dispositionId = 666666;

  test('finds the matching feature in the database', done => {
    let existingFeature = new Feature({
      properties: {
        DISPOSITION_TRANSACTION_SID: dispositionId
      }
    });
    existingFeature.save().then(() => {
      request(app)
        .get('/api/public/search/dispositionTransactionId/' + dispositionId)
        .expect(200)
        .then(response => {
          expect(response.body).toBeDefined();
          expect(response.body).not.toBeNull();
          expect(response.body).toHaveProperty('crs');
          expect(response.body).toHaveProperty('features');
          expect(response.body.features.length).toBe(1);
          expect(response.body.features[0]._id).toBe(existingFeature._id.toString());
          done();
        });
    });
  });
});
