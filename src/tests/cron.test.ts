import test from 'ava';
import * as moment from 'moment';
import { MongoClient, ObjectId } from 'mongodb';
import { promise as sleep } from 'es6-sleep';
import { MongoCron } from '..';

test.beforeEach(async (t) => {
  t.context.mongo = await MongoClient.connect('mongodb://localhost:27017');
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
    onDocument: () => times++,
  });
  await t.context.collection.insert([
    { sleepUntil: new Date() },
    { sleepUntil: new Date() },
    { sleepUntil: null },
    { sleepUntil: new Date() },
  ]);
  await c.start();
  await sleep(3000);
  await c.stop();
  t.is(times, 3);
  t.is(await t.context.collection.count({ sleepUntil: { $ne: null }}), 0);
});

test.serial('cron should trigger event methods', async (t) => {
  let onStart = false;
  let onStop = false;
  let onDocument = false;
  const c = new MongoCron({
    collection: t.context.collection,
    onStart: async () => onStart = true,
    onStop: async () => onStop = true,
    onDocument: async (doc) => onDocument = true,
  });
  await t.context.collection.insert({
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
    onIdle: () => count++,
  });
  await c.start();
  await sleep(1000);
  await c.stop();
  t.is(count, 1);
});

test.serial('locked documents should not be available for locking', async (t) => {
  let processed = false;
  const future = moment().add(5000, 'millisecond');
  const c = new MongoCron({
    collection: t.context.collection,
    lockDuration: 5000,
    onDocument: () => processed = true,
  });
  await t.context.collection.insert({
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
    condition: { handle: true },
    onDocument: () => count++,
  });
  await t.context.collection.insert({
    handle: true,
    sleepUntil: new Date(),
  });
  await t.context.collection.insert({
    sleepUntil: new Date(),
  });
  await c.start();
  await sleep(4000);
  await c.stop();
  t.is(count, 1);
});

test.serial('document processing should not start before `sleepUntil`', async (t) => {
  let ranInFuture = false;
  const future = moment().add(3000, 'millisecond');
  const c = new MongoCron({
    collection: t.context.collection,
    onDocument: async (doc) => ranInFuture = moment() >= future,
  });
  await c.start();
  await t.context.collection.insert({
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
    onDocument: async (doc) => repeated++
  });
  await c.start();
  await t.context.collection.insert({
    sleepUntil: new Date(),
    interval: '* * * * * *',
  });
  await sleep(3000);
  await c.stop();
  t.is(repeated >= 3, true);
});

test.serial('document should stop recurring at `repeatUntil`', async (t) => {
  let repeated = 0;
  const stop = moment().add(3000, 'millisecond');
  const c = new MongoCron({
    collection: t.context.collection,
    onDocument: async (doc) => repeated++,
    reprocessDelay: 1000,
  });
  await c.start();
  await t.context.collection.insert({
    sleepUntil: new Date(),
    interval: '* * * * * *',
    repeatUntil: stop.toDate(),
  });
  await sleep(3000);
  await c.stop();
  t.is(repeated, 2);
});

test.serial('document with `autoRemove` should be deleted when completed', async (t) => {
  const c = new MongoCron({
    collection: t.context.collection
  });
  await c.start();
  await t.context.collection.insert({
    sleepUntil: new Date(),
    autoRemove: true,
  });
  await sleep(2000);
  await c.stop();
  t.is(await t.context.collection.count(), 0);
});
