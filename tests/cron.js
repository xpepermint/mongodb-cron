import test from 'ava';
import {MongoClient, ObjectId} from 'mongodb';
import Redis from 'ioredis';
import {promise as sleep} from 'es6-sleep';
import {MongoCron, MongoCronManager} from '../dist';
import moment from 'moment';

test.beforeEach(async (t) => {
  t.context.db = await MongoClient.connect('mongodb://localhost:27017/test');
  t.context.collection = t.context.db.collection('jobs');
  t.context.redis = new Redis();
  try { await t.context.redis.flushall() } catch(e) {}
  try { await t.context.collection.drop() } catch(e) {}
});

test.afterEach(async (t) => {
  await t.context.redis.quit();
  await t.context.db.close();
});

test.serial('document with `sleepUntil` should be processed', async (t) => {
  let c = new MongoCron({
    collection: t.context.collection
  });
  await c.collection.insert([
    {sleepUntil: null},
    {sleepUntil: null},
    {sleepUntil: null}
  ]);
  await c.start();
  await sleep(3000);
  await c.stop();
  t.is(await c.collection.count({sleepUntil: {$exists: true}}), 0);
});

test.serial('cron should trigger event methods', async (t) => {
  let onStart = false;
  let onStop = false;
  let onDocument = false;
  let c = new MongoCron({
    collection: t.context.collection,
    onStart: async (doc) => onStart = true,
    onStop: async (doc) => onStop = true,
    onDocument: async (doc) => onDocument = true
  });
  await c.collection.insert({
    sleepUntil: null
  });
  await c.start();
  await sleep(300);
  await c.stop();
  await sleep(100);
  t.is(onStart, true);
  t.is(onStop, true);
  t.is(onDocument, true);
});

test.serial('locked documents should not be available for locking', async (t) => {
  let future = moment().add(5000, 'millisecond');
  let processed = false;
  let c = new MongoCron({
    collection: t.context.collection,
    lockDuration: 5000,
    onDocument: () => processed = true
  });
  await c.collection.insert({
    sleepUntil: future.toDate()
  });
  await sleep(500);
  await c.stop();
  t.is(processed, false);
});

test.serial('document processing should not start before `sleepUntil`', async (t) => {
  let future = moment().add(3000, 'millisecond');
  let ranInFuture = false;
  let c = new MongoCron({
    collection: t.context.collection,
    onDocument: async (doc) => ranInFuture = moment() >= future
  });
  await c.start();
  await c.collection.insert({
    sleepUntil: future.toDate()
  });
  await sleep(4000);
  await c.stop();
  t.is(ranInFuture, true);
});

test.serial('document with `interval` should run repeatedly', async (t) => {
  let repeated = 0;
  let c = new MongoCron({
    collection: t.context.collection,
    onDocument: async (doc) => repeated++
  });
  await c.start();
  await c.collection.insert({
    sleepUntil: null,
    interval: '* * * * * *'
  });
  await sleep(3000);
  await c.stop();
  t.is(repeated >= 3, true);
});

test.serial('document should stop recurring at `repeatUntil`', async (t) => {
  let stop = moment().add(3000, 'millisecond');
  let repeated = 0;
  let c = new MongoCron({
    collection: t.context.collection,
    onDocument: async (doc) => repeated++,
    reprocessDelay: 1000
  });
  await c.start();
  await c.collection.insert({
    sleepUntil: null,
    interval: '* * * * * *',
    repeatUntil: stop.toDate()
  });
  await sleep(3000);
  await c.stop();
  t.is(repeated, 2);
});

test.serial('document with `autoRemove` should be deleted when completed', async (t) => {
  let c = new MongoCron({
    collection: t.context.collection
  });
  await c.start()
  await c.collection.insert({
    sleepUntil: null,
    autoRemove: true
  });
  await sleep(2000);
  await c.stop();
  t.is((await c.collection.count()), 0);
});
