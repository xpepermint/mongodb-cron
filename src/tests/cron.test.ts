import test from 'ava';
import * as moment from 'moment';
import { MongoClient, ObjectId } from 'mongodb';
import { promise as sleep } from 'es6-sleep';
import { MongoCron } from '..';

test.beforeEach(async (t) => {
  t.context.mongo = await MongoClient.connect('mongodb://localhost:27017', { useNewUrlParser: true });
  t.context.db = t.context.mongo.db('test');
  t.context.collection = t.context.db.collection('jobs');
  try { await t.context.collection.drop(); } catch (e) {}
});

test.afterEach(async (t) => {
  await t.context.mongo.close();
});

test.serial('document with `sleepUntil` should be processed', async (t) => {
  let times = 0;
  const c = new MongoCron({
    collection: t.context.collection,
    lockDuration: 0,
    onDocument: () => times++,
  });
  await t.context.collection.insertMany([
    { sleepUntil: new Date() },
    { sleepUntil: new Date() },
    { sleepUntil: null },
    { sleepUntil: new Date() },
  ]);
  await c.start();
  await sleep(3000);
  await c.stop();
  t.is(times, 3);
  t.is(await t.context.collection.countDocuments({ sleepUntil: { $ne: null }}), 0);
});

test.serial('cron should trigger event methods', async (t) => {
  let onStart = false;
  let onStop = false;
  let onDocument = false;
  const c = new MongoCron({
    collection: t.context.collection,
    lockDuration: 0,
    onStart: async () => onStart = true,
    onStop: async () => onStop = true,
    onDocument: async (doc) => onDocument = true,
  });
  await t.context.collection.insertOne({
    sleepUntil: new Date(),
  });
  await c.start();
  await sleep(300);
  await c.stop();
  await sleep(100);
  t.is(onStart, true);
  t.is(onStop, true);
  t.is(onDocument, true);
});

test.serial('cron should trigger the `onIdle` handler only once', async (t) => {
  let count = 0;
  const c = new MongoCron({
    collection: t.context.collection,
    lockDuration: 0,
    onIdle: () => count++,
  });
  await c.start();
  await sleep(1000);
  await c.stop();
  t.is(count, 1);
});

test.serial('locked documents should not be available for locking', async (t) => {
  let processed = false;
  const future = moment().add(5000, 'milliseconds');
  const c = new MongoCron({
    collection: t.context.collection,
    lockDuration: 5000,
    onDocument: () => processed = true,
  });
  await t.context.collection.insertOne({
    sleepUntil: future.toDate(),
  });
  await c.start();
  await sleep(500);
  await c.stop();
  t.is(processed, false);
});

test.serial('condition should filter lockable documents', async (t) => {
  let count = 0;
  const c = new MongoCron({
    collection: t.context.collection,
    lockDuration: 0,
    condition: { handle: true },
    onDocument: () => count++,
  });
  await t.context.collection.insertOne({
    handle: true,
    sleepUntil: new Date(),
  });
  await t.context.collection.insertOne({
    sleepUntil: new Date(),
  });
  await c.start();
  await sleep(4000);
  await c.stop();
  t.is(count, 1);
});

test.serial('document processing should not start before `sleepUntil`', async (t) => {
  let ranInFuture = false;
  const future = moment().add(3000, 'milliseconds');
  const c = new MongoCron({
    collection: t.context.collection,
    lockDuration: 0,
    onDocument: async (doc) => ranInFuture = moment() >= future,
  });
  await c.start();
  await t.context.collection.insertOne({
    sleepUntil: future.toDate(),
  });
  await sleep(4000);
  await c.stop();
  t.is(ranInFuture, true);
});

test.serial('document with `interval` should run repeatedly', async (t) => {
  let repeated = 0;
  const c = new MongoCron({
    collection: t.context.collection,
    lockDuration: 0,
    onDocument: async (doc) => {
      repeated++;
    },
  });
  await c.start();
  await t.context.collection.insertOne({
    sleepUntil: new Date(),
    interval: '* * * * * *',
  });
  await sleep(3100);
  await c.stop();
  t.is(repeated >= 3, true);
});

test.serial('document should stop recurring at `repeatUntil`', async (t) => {
  let repeated = moment();
  const stop = moment().add(2500, 'milliseconds');
  const c = new MongoCron({
    collection: t.context.collection,
    lockDuration: 0,
    onDocument: async (doc) => repeated = moment(),
    reprocessDelay: 1000,
  });
  await c.start();
  await t.context.collection.insertOne({
    sleepUntil: new Date(),
    interval: '* * * * * *',
    repeatUntil: stop.toDate(),
  });
  await sleep(6000);
  await c.stop();
  t.is(repeated.isAfter(stop), false);
});

test.serial('document with `autoRemove` should be deleted when completed', async (t) => {
  const c = new MongoCron({
    collection: t.context.collection,
    lockDuration: 0,
  });
  await c.start();
  await t.context.collection.insertOne({
    sleepUntil: new Date(),
    autoRemove: true,
  });
  await sleep(2000);
  await c.stop();
  t.is(await t.context.collection.countDocuments(), 0);
});
