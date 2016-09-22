import {MongoClient} from 'mongodb';
import {MongoCron} from '../src';
import {promise as sleep} from 'es6-sleep';

(async function() {
  let mongo = await MongoClient.connect('mongodb://localhost:27017/test');

  let cron = new MongoCron({
    collection: mongo.collection('events'),
    onDocument: (doc, cron) => console.log('onDocument', doc),
    onError: (err, cron) => console.log(err),
    onStart: (cron) => console.log('started ...'),
    onStop: (cron) => console.log('stopped'),
    nextDelay: 1000,
    reprocessDelay: 1000,
    idleDelay: 10000,
    lockDuration: 600000,
    processableFieldPath: 'cron.processable',
    lockUntilFieldPath: 'cron.lockUntil',
    waitUntilFieldPath: 'cron.waitUntil',
    intervalFieldPath: 'cron.interval',
    repeatUntilFieldPath: 'cron.repeatUntil',
    autoRemoveFieldPath: 'cron.autoRemove'
  });

  setTimeout(function() {
    cron.start();
  }, 0);

  setTimeout(function() {
    cron.collection.insert({
      name: 'Ricky Martin Show',
      cron: {processable: true}
    });
  }, 2000);

  setTimeout(function() {
    cron.stop();
  }, 20000);

})().catch(console.error);
