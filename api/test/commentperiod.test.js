const test_helper = require('./test_helper');
const app = test_helper.app;
const mongoose = require('mongoose');
const request = require('supertest');
let swaggerParams = {
  swagger: {
      params:{
          auth_payload:{
              scopes: [ 'sysadmin', 'public' ],
              userID: null
          },
          fields: {
            value: ['name', 'description']
          }
      }
  }
};

let publicSwaggerParams = {
  swagger: {
      params:{
        fields: {
          value: ['name', 'description']
        }
      }
  }
};

const _ = require('lodash');

const commentPeriodController = require('../controllers/commentperiod.js');
require('../helpers/models/commentperiod');
var CommentPeriod = mongoose.model('CommentPeriod');

app.get('/api/commentperiod', function(req, res) {
  return commentPeriodController.protectedGet(swaggerParams, res);
});

app.get('/api/commentperiod/:id', function(req, res) { 
  let swaggerWithExtraParams = _.cloneDeep(swaggerParams);
  swaggerWithExtraParams['swagger']['params']['CommentPeriodId'] = {
      value: req.params.id
  };
  return commentPeriodController.protectedGet(swaggerWithExtraParams, res);
});

app.get('/api/public/commentperiod', function(req, res) {
  return commentPeriodController.publicGet(publicSwaggerParams, res);
});

app.get('/api/public/commentperiod/:id', function(req, res) { 
  let swaggerWithExtraParams = _.cloneDeep(publicSwaggerParams);
  swaggerWithExtraParams['swagger']['params']['CommentPeriodId'] = {
      value: req.params.id
  };
  return commentPeriodController.publicGet(swaggerWithExtraParams, res);
});

app.post('/api/public/commentperiod/', function(req, res) {
  let swaggerWithExtraParams = _.cloneDeep(publicSwaggerParams);
  swaggerWithExtraParams['swagger']['params']['commentPeriod'] = {
    value: req.body
  };
  return commentPeriodController.unProtectedPost(swaggerWithExtraParams, res);
});

app.put('/api/commentperiod/:id', function(req, res) {
  let swaggerWithExtraParams = _.cloneDeep(swaggerParams);
  swaggerWithExtraParams['swagger']['params']['CommentPeriodId'] = {
    value: req.params.id
  };
  swaggerWithExtraParams['swagger']['params']['cp'] = {
    value: req.body
  };
  return commentPeriodController.protectedPut(swaggerWithExtraParams, res);
});

app.put('/api/commentperiod/:id/publish', function(req, res) {
  let swaggerWithExtraParams = _.cloneDeep(swaggerParams);
  swaggerWithExtraParams['swagger']['params']['CommentPeriodId'] = {
      value: req.params.id
  };
  return commentPeriodController.protectedPublish(swaggerWithExtraParams, res);
});

app.put('/api/commentperiod/:id/unpublish', function(req, res) {
  let swaggerWithExtraParams = _.cloneDeep(swaggerParams);
  swaggerWithExtraParams['swagger']['params']['CommentPeriodId'] = {
      value: req.params.id
  };
  return commentPeriodController.protectedUnPublish(swaggerWithExtraParams, res);
});


const commentPeriods = [
  { code: 'SPECIAL', name: 'Special Comment', description: 'This Comment is so special', tags: [['public'], ['sysadmin']], isDeleted: false },
  { code: 'VANILLA', name: 'Vanilla Ice Cream', description: 'I like Ice Cream', tags: [['public']], isDeleted: false },
  { code: 'TOP_SECRET', name: 'Confidential Comment', description: 'This is a secret govt project',tags: [['sysadmin']], isDeleted: false },
  { code: 'DELETED', name: 'Deleted Comment', description: 'Trolling for suckers', tags: [['public'],['sysadmin']], isDeleted: true },
];

function setupCommentPeriods(commentPeriods) {
  return new Promise(function(resolve, reject) {
      CommentPeriod.collection.insert(commentPeriods, function(error, documents) {
          if (error) { 
              reject(error); 
          }
          else {
              resolve(documents) 
          }
      });
  });
};

describe('GET /commentperiod', () => {
  test('returns a list of non-deleted, public and sysadmin comment periods', done => {
    setupCommentPeriods(commentPeriods).then((documents) => {
      request(app).get('/api/commentperiod')
      .expect(200)
      .then(response =>{
        expect(response.body.length).toEqual(3);

        let firstCommentPeriod = response.body[0];
        expect(firstCommentPeriod).toHaveProperty('_id');
        expect(firstCommentPeriod.description).toBe('This Comment is so special');
        expect(firstCommentPeriod['tags']).toEqual(expect.arrayContaining([["public"], ["sysadmin"]]));

        let secondCommentPeriod = response.body[1];
        expect(secondCommentPeriod).toHaveProperty('_id');
        expect(secondCommentPeriod.description).toBe('I like Ice Cream');
        expect(secondCommentPeriod['tags']).toEqual(expect.arrayContaining([["public"]]));

        let secretCommentPeriod = response.body[2];
        expect(secretCommentPeriod).toHaveProperty('_id');
        expect(secretCommentPeriod.description).toBe('This is a secret govt project');
        expect(secretCommentPeriod['tags']).toEqual(expect.arrayContaining([["sysadmin"]]));
        done()
      });
    });
  });

  test('returns an empty array when there are no comments', done => {
      request(app).get('/api/commentperiod')
      .expect(200)
      .then(response => {
          expect(response.body.length).toBe(0);
          expect(response.body).toEqual([]);
          done();
      });
  });
});

describe('GET /comment/{id}', () => {
  test('returns a single CommentPeriod ', done => {
    setupCommentPeriods(commentPeriods).then((documents) => {
      CommentPeriod.findOne({code: 'SPECIAL'}).exec(function(error, comment) {
        let specialCommentId = comment._id.toString();
        let uri = '/api/commentperiod/' + specialCommentId;
        
        request(app)
        .get(uri)
        .expect(200)
        .then(response => {
          expect(response.body.length).toBe(1);
          let responseObject = response.body[0];
          expect(responseObject).toMatchObject({
              '_id': specialCommentId,
              'tags': expect.arrayContaining([['public'], ['sysadmin']]),
              'code': 'SPECIAL'
          });
          done();
        });
      });;
    });
  });
});

describe('GET /public/commentperiod', () => {
  test('returns a list of public Comments', done => {
    setupCommentPeriods(commentPeriods).then((documents) => {
      request(app).get('/api/public/commentperiod')
      .expect(200)
      .then(response =>{
        expect(response.body.length).toEqual(2);

        let firstCommentPeriod = response.body[0];
        expect(firstCommentPeriod).toHaveProperty('_id');
        expect(firstCommentPeriod.description).toBe('This Comment is so special');
        expect(firstCommentPeriod['tags']).toEqual(expect.arrayContaining([["public"], ["sysadmin"]]));

        let secondCommentPeriod = response.body[1];
        expect(secondCommentPeriod).toHaveProperty('_id');
        expect(secondCommentPeriod.description).toBe('I like Ice Cream');
        expect(secondCommentPeriod['tags']).toEqual(expect.arrayContaining([["public"]]));
        done()
      });
    });
  });

  test('returns an empty array when there are no CommentPeriods', done => {
    request(app).get('/api/public/commentperiod')
    .expect(200)
    .then(response => {
      expect(response.body.length).toBe(0);
      expect(response.body).toEqual([]);
      done();
    });
  });
});

describe('GET /public/commentperiod/{id}', () => {
  test('returns a single public comment period ', done => {
    setupCommentPeriods(commentPeriods).then((documents) => {
      CommentPeriod.findOne({code: 'SPECIAL'}).exec(function(error, commentPeriod) {
        if (error) { 
          console.log(error);
          throw error
        }
        let specialCommentPeriodId = commentPeriod._id.toString();
        let uri = '/api/public/commentperiod/' + specialCommentPeriodId;
        
        request(app)
        .get(uri)
        .expect(200)
        .then(response => {
          expect(response.body.length).toBe(1);
          let responseObj = response.body[0];
          expect(responseObj).toMatchObject({
              '_id': specialCommentPeriodId,
              'tags': expect.arrayContaining([['public'], ['sysadmin']]),
              code: 'SPECIAL'
          });
          done();
        });
      });;
    });
  });
});

describe('POST /public/commentperiod', () => {
  test.skip('creates a new comment period', done => {
    let commentPeriodObj = {
        name: 'Victoria',
        description: 'Victoria is a great place'
    };
    request(app).post('/api/public/commentperiod', commentPeriodObj)
    .send(commentPeriodObj)
    .expect(200).then(response => {
        expect(response.body).toHaveProperty('_id');
        CommentPeriod.findById(response.body['_id']).exec(function(error, comment) {
            expect(comment).not.toBeNull();
            expect(comment.name).toBe('Victoria');
            expect(comment.description).toBe('Victoria is a great place');
            done();
        });
    });
  });

  test.skip('sets the date added and comment status to pending', done => {
    let commentObj = {
      name: 'Victoria',
      comment: 'Victoria is a great place'
    };
    request(app).post('/api/public/commentperiod', commentObj)
    .send(commentObj)
    .expect(200).then(response => {
      expect(response.body).toHaveProperty('_id');
      CommentPeriod.findById(response.body['_id']).exec(function(error, comment) {
        expect(comment).not.toBeNull();
        expect(comment.commentStatus).toBe('Pending');
        expect(comment.dateAdded).not.toBeNull();
        done();
      });
    });
  });

  describe.skip('tags', () => {
    test('defaults to sysadmin for tags and review tags', done => {
      let commentObj = {
        name: 'Victoria',
        comment: 'Victoria is a great place'
      };
      request(app).post('/api/public/commentperiod', commentObj)
      .send(commentObj)
      .expect(200).then(response => {
        expect(response.body).toHaveProperty('_id');
        CommentPeriod.findById(response.body['_id']).exec(function(error, comment) {
          expect(comment).not.toBeNull();

          expect(comment.tags.length).toEqual(1)
          expect(comment.tags[0]).toEqual(expect.arrayContaining(['sysadmin']));

          expect(comment.review.tags.length).toEqual(1)
          expect(comment.review.tags[0]).toEqual(expect.arrayContaining(['sysadmin']));
          done();
        });
      });
    });

    test('sets commentAuthor tags to public, and internal tags to by default', done => {
      let commentObj = {
        name: 'Victoria',
        comment: 'Victoria is a great place'
      };
      request(app).post('/api/public/commentperiod', commentObj)
      .send(commentObj)
      .expect(200).then(response => {
        expect(response.body).toHaveProperty('_id');
        CommentPeriod.findById(response.body['_id']).exec(function(error, comment) {
          expect(comment.commentAuthor).not.toBeNull();

          expect(comment.commentAuthor.tags.length).toEqual(2);
          expect(comment.commentAuthor.tags[0]).toEqual(expect.arrayContaining(['sysadmin']));
          expect(comment.commentAuthor.tags[1]).toEqual(expect.arrayContaining(['public']));

          expect(comment.commentAuthor.internal.tags.length).toEqual(1);
          expect(comment.commentAuthor.internal.tags[0]).toEqual(expect.arrayContaining(['sysadmin']));
          
          done();
        });
      });
    });

    test('sets commentAuthor tags to sysadmin if requestedAnonymous', done => {
      let commentObj = {
        name: 'Victoria',
        comment: 'Victoria is a great place',
        commentAuthor: {
          requestedAnonymous: true
        }
      };

      request(app).post('/api/public/commentperiod', commentObj)
      .send(commentObj)
      .expect(200).then(response => {
        expect(response.body).toHaveProperty('_id');
        CommentPeriod.findById(response.body['_id']).exec(function(error, comment) {
          expect(comment.commentAuthor).not.toBeNull();

          expect(comment.commentAuthor.tags.length).toEqual(1);
          expect(comment.commentAuthor.tags[0]).toEqual(expect.arrayContaining(['sysadmin']));
          done();
        });
      });
    });
  });
});

describe('PUT /commentperiod/:id', () => {
  let existingCommentPeriod;
  beforeEach(() => {
    existingCommentPeriod = new CommentPeriod({
      code: 'SOME_APP',
      description: 'I like developmment.',
      internal: {
        tags:[]
      }
    });
    return existingCommentPeriod.save();
  });

  test('updates a comment period', done => {
    let updateData = {
        description: 'This application is amazing!',
        internal: {tags: []}
    };
    let uri = '/api/commentperiod/' + existingCommentPeriod._id;
    request(app).put(uri, updateData)
    .send(updateData)
    .then(response => {
      CommentPeriod.findOne({description: 'This application is amazing!'}).exec(function(error, comment) {
        expect(comment).toBeDefined();
        expect(comment).not.toBeNull();
        done();
      });
    });
  });

  test('404s if the comment does not exist', done => {
      let uri = '/api/commentperiod/' + 'NON_EXISTENT_ID';
      request(app).put(uri)
      .send({description: 'hacker_man', internal: {tags: []}})
      .expect(404)
      .then(response => {
        done();
      });
  });

  test('does not allow updating tags, and sets internal tags to sysadmin', done => {
    let existingCommentPeriod = new CommentPeriod({
      code: 'EXISTING',
      tags: [['sysadmin']]
    });
    let updateData = {
      tags: [['public'], ['sysadmin']],
      internal: {tags: []}
    };
    existingCommentPeriod.save().then(commentPeriod => {
      let uri = '/api/commentperiod/' + commentPeriod._id;
      request(app).put(uri, updateData)
      .send(updateData)
      .then(response => {
        CommentPeriod.findById(commentPeriod._id).exec(function(error, updatedCommentPeriod) {
          expect(updatedCommentPeriod.tags.length).toEqual(1);
          expect(updatedCommentPeriod.tags[0]).toEqual(expect.arrayContaining(["sysadmin"]));

          expect(updatedCommentPeriod.internal.tags.length).toEqual(1);
          expect(updatedCommentPeriod.internal.tags[0]).toEqual(expect.arrayContaining(["sysadmin"]));
          done();
        });
      });
    });
  });

  test.skip('does not set _addedBy', done => {
    
  });
});

describe('PUT /commentperiod/:id/publish', () => {
  test('publishes a comment period', done => {
      let existingCommentPeriod = new CommentPeriod({
          code: 'EXISTING',
          description: 'I love this project',
          tags: []
      });
      existingCommentPeriod.save().then(commentPeriod => {
          let uri = '/api/commentperiod/' + commentPeriod._id + '/publish';
          request(app).put(uri)
          .expect(200)
          .send({})
          .then(response => {
            CommentPeriod.findOne({code: 'EXISTING'}).exec(function(error, updatedCommentPeriod) {
              expect(updatedCommentPeriod).toBeDefined();
              expect(updatedCommentPeriod.tags[0]).toEqual(expect.arrayContaining(['public']));
              done();
            });
          });
      })
      
  });

  test('404s if the comment period does not exist', done => {
      let uri = '/api/commentperiod/' + 'NON_EXISTENT_ID' + '/publish';
      request(app).put(uri)
      .send({})
      .expect(404)
      .then(response => {
          done();
      });
  });
});

describe('PUT /commentperiod/:id/unpublish', () => {
  test('unpublishes a commentperiod', done => {
      let existingCommentPeriod = new CommentPeriod({
          code: 'EXISTING',
          description: 'I love this project',
          tags: [['public']]
      });
      existingCommentPeriod.save().then(commentPeriod => {
          let uri = '/api/commentperiod/' + commentPeriod._id + '/unpublish';
          request(app).put(uri)
          .expect(200)
          .send({})
          .then(response => {
              CommentPeriod.findOne({code: 'EXISTING'}).exec(function(error, updatedCommentPeriod) {
                  expect(updatedCommentPeriod).toBeDefined();
                  expect(updatedCommentPeriod.tags[0]).toEqual(expect.arrayContaining([]));
                  done();
              });
          });
      });
  });

  test('404s if the commentPeriod does not exist', done => {
      let uri = '/api/commentperiod/' + 'NON_EXISTENT_ID' + '/unpublish';
      request(app).put(uri)
      .send({})
      .expect(404)
      .then(response => {
          done();
      });
  });
});

describe('DELETE /commentperiod/:id', () => {
  
});

