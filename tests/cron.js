import test from 'ava';
import {MongoClient} from 'mongodb';
import {promise as sleep} from 'es6-sleep';
import {MongoCron} from '../dist';
import moment from 'moment';

test.beforeEach(async (t) => {
  t.context.db = await MongoClient.connect('mongodb://localhost:27017/test');
  t.context.collection = t.context.db.collection('events');
  try { await t.context.collection.drop() } catch(e) {}
});

test.afterEach(async (t) => {
  await t.context.db.close();
});

test.serial.cb('document with `processable=true` triggers the `onDocument` handler', (t) => {
  let {collection} = t.context;

  let cron = new MongoCron({
    collection,
    onDocument: async (doc) => {
      await cron.stop();
      t.pass();
      t.end();
    }
  });
  cron.start();
  collection.insert({
    processable: true
  });
});

test.serial.cb('locked documents should not be available for locking', (t) => {
  let {collection} = t.context;

  let future = moment().add(5000, 'millisecond');
  let cron = new MongoCron({
    collection,
    lockTimeout: 5000
  });
  collection.insert({
    processable: true,
    lockUntil: future.toDate()
  }).then(r => {
    return cron._lockNextDocument();
  }).then(r => {
    if (!r) {
      t.pass();
    } else {
      t.fail();
    }
    t.end();
    cron.stop({force: true});
  });
});

test.serial.cb('document with `waitUntil` should delay execution', (t) => {
  let {collection} = t.context;

  let future = moment().add(3000, 'millisecond');
  let cron = new MongoCron({
    collection,
    onDocument: async (doc) => {
      await cron.stop();
      if (moment() >= future) {
        t.pass();
      } else {
        t.fail();
      }
      t.end();
    }
  });
  cron.start();
  collection.insert({
    processable: true,
    waitUntil: future.toDate()
  });
});

test.serial.cb('document with `interval` should run repeatedly', (t) => {
  let {collection} = t.context;

  let repeated = 0;
  let cron = new MongoCron({
    collection,
    onDocument: async (doc) => repeated++
  });
  cron.start();
  collection.insert({
    processable: true,
    interval: '* * * * * *'
  });

  setTimeout(() => {
    cron.stop();
    if (repeated >= 2) {
      t.pass();
    } else {
      t.fail();
    }
    t.end();
  }, 3000);
});

test.serial.cb('document should stop recurring at `repeatUntil`', (t) => {
  let {collection} = t.context;

  let stop = moment().add(3000, 'millisecond');
  let repeated = 0;
  let cron = new MongoCron({
    collection,
    onDocument: async (doc) => repeated++,
    reprocessDelay: 1000
  });
  cron.start();
  collection.insert({
    processable: true,
    interval: '* * * * * *',
    repeatUntil: stop.toDate()
  });

  setTimeout(() => {
    cron.stop();
    if (repeated === 2) {
      t.pass();
    } else {
      t.fail();
    }
    t.end();
  }, 3000);
});

test.serial.cb('document with `autoRemove` should be deleted when completed', (t) => {
  let {collection} = t.context;
  let stop = moment().add(3000, 'millisecond');
  let repeated = 0;
  let cron = new MongoCron({
    collection
  });
  cron.start();
  collection.insert({
    processable: true,
    autoRemove: true
  });
  setTimeout(() => {
    cron.stop();
    collection.count().then((n) => {
      if (n === 0) {
        t.pass();
      } else {
        t.fail();
      }
      t.end();
    })
  }, 2000);
});
