const {MongoClient} = require('mongodb');
const {MongoCron} = require('../dist');
const sleep = require('es6-sleep').promise;

MongoClient.connect('mongodb://localhost:27017/test').then((db) => {
  const collection = db.collection('events');

  const cron = new MongoCron({
    collection,
    enabledFieldPath: 'cron.enabled',
    waitUntilFieldPath: 'cron.waitUntil',
    expireAtFieldPath: 'cron.waitUntil',
    intervalFieldPath: 'cron.interval',
    deleteExpiredFieldPath: 'cron.deleteExpired',
    lockedFieldPath: 'cron.locked',
    startedAtFieldPath: 'cron.startedAt',
    finishedAtFieldPath: 'cron.finishedAt',
    onDocument: (doc, cron) => console.log('onDocument', doc),
    onError: (err, cron) => console.log(err),
    onStart: (cron) => console.log('started ...'),
    onStop: (cron) => console.log('stopped'),
    nextDelay: 0,
    reprocessDelay: 1000,
    idleDelay: 1000,
  });
  cron.start().catch(console.log);

  setTimeout(function() {
    collection.insert({
      name: 'Ricky Martin Show',
      cron: {enabled: true}
    });
  }, 2000);

}).catch(console.log);
