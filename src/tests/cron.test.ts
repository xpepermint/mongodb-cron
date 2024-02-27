import { Spec } from '@hayspec/spec';
import { promise as sleep } from 'es6-sleep';
import * as moment from 'moment';
import { Collection, Db, MongoClient } from 'mongodb';
import { MongoCron } from '..';

const spec = new Spec<{
  db: Db;
  mongo: MongoClient;
  collection: Collection;
}>();

spec.before(async (stage) => {
  const mongo = await MongoClient.connect('mongodb://localhost:27017');
  const db = mongo.db('test');
  const collection = db.collection('jobs');
  stage.set('mongo', mongo);
  stage.set('db', db);
  stage.set('collection', collection);
});

spec.beforeEach(async (ctx) => {
  const collection = ctx.get('collection');
  await collection.drop().catch(() => { /** does not exist */ });
});

spec.after(async (stage) => {
  const mongo = stage.get('mongo');
  await mongo.close();
});

spec.test('document with `sleepUntil` should be processed', async (ctx) => {
  let times = 0;
  const collection = ctx.get('collection');
  const cron = new MongoCron({
    collection,
    lockDuration: 0,
    onDocument: () => times++,
  });
  await collection.insertMany([
    { sleepUntil: new Date() },
    { sleepUntil: new Date() },
    { sleepUntil: null },
    { sleepUntil: new Date() },
  ]);
  await cron.start();
  await sleep(3000);
  await cron.stop();
  ctx.is(times, 3);
  ctx.is(await collection.countDocuments({ sleepUntil: { $ne: null }}), 0);
});

spec.test('cron should trigger event methods', async (ctx) => {
  let onStart = false;
  let onStop = false;
  let onDocument = false;
  const collection = ctx.get('collection');
  const cron = new MongoCron({
    collection,
    lockDuration: 0,
    onStart: async () => onStart = true,
    onStop: async () => onStop = true,
    onDocument: async (doc) => onDocument = true,
  });
  await collection.insertOne({
    sleepUntil: new Date(),
  });
  await cron.start();
  await sleep(300);
  await cron.stop();
  await sleep(100);
  ctx.is(onStart, true);
  ctx.is(onStop, true);
  ctx.is(onDocument, true);
});

spec.test('cron should trigger the `onIdle` handler only once', async (ctx) => {
  let count = 0;
  const collection = ctx.get('collection');
  const cron = new MongoCron({
    collection,
    lockDuration: 0,
    onIdle: () => count++,
  });
  await cron.start();
  await sleep(1000);
  await cron.stop();
  ctx.is(count, 1);
});

spec.test('locked documents should not be available for locking', async (ctx) => {
  let processed = false;
  const future = moment().add(5000, 'milliseconds');
  const collection = ctx.get('collection');
  const cron = new MongoCron({
    collection,
    lockDuration: 5000,
    onDocument: () => processed = true,
  });
  await collection.insertOne({
    sleepUntil: future.toDate(),
  });
  await cron.start();
  await sleep(500);
  await cron.stop();
  ctx.is(processed, false);
});

spec.test('recurring documents should be unlocked when prossed', async (ctx) => {
  let processed = 0;
  const now = moment();
  const collection = ctx.get('collection');
  const cron = new MongoCron({
    collection,
    lockDuration: 60000,
    onDocument: () => {
      processed++;
      return sleep(2000);
    },
  });
  await collection.insertOne({
    sleepUntil: now.toDate(),
    interval: '* * * * * *',
  });
  await cron.start();
  await sleep(6000);
  await cron.stop();
  ctx.is(processed, 3);
});

spec.test('recurring documents should process from current date', async (ctx) => {
  let processed = 0;
  const past = moment().subtract(10, 'days');
  const collection = ctx.get('collection');
  const cron = new MongoCron({
    collection,
    onDocument: () => processed++,
  });
  await collection.insertOne({
    sleepUntil: past.toDate(), // should be treated as now() date
    interval: '* * * * * *',
  });
  await cron.start();
  await sleep(2000);
  await cron.stop();
  ctx.true(processed <= 4);
});

spec.test('condition should filter lockable documents', async (ctx) => {
  let count = 0;
  const collection = ctx.get('collection');
  const cron = new MongoCron({
    collection,
    lockDuration: 0,
    condition: { handle: true },
    onDocument: () => count++,
  });
  await collection.insertOne({
    handle: true,
    sleepUntil: new Date(),
  });
  await collection.insertOne({
    sleepUntil: new Date(),
  });
  await cron.start();
  await sleep(4000);
  await cron.stop();
  ctx.is(count, 1);
});

spec.test('document processing should not start before `sleepUntil`', async (ctx) => {
  let ranInFuture = false;
  const future = moment().add(3000, 'milliseconds');
  const collection = ctx.get('collection');
  const cron = new MongoCron({
    collection,
    lockDuration: 0,
    onDocument: async (doc) => ranInFuture = moment() >= future,
  });
  await cron.start();
  await collection.insertOne({
    sleepUntil: future.toDate(),
  });
  await sleep(4000);
  await cron.stop();
  ctx.is(ranInFuture, true);
});

spec.test('document with `interval` should run repeatedly', async (ctx) => {
  let repeated = 0;
  const collection = ctx.get('collection');
  const cron = new MongoCron({
    collection,
    lockDuration: 0,
    onDocument: async (doc) => {
      repeated++;
    },
  });
  await cron.start();
  await collection.insertOne({
    sleepUntil: new Date(),
    interval: '* * * * * *',
  });
  await sleep(3100);
  await cron.stop();
  ctx.is(repeated >= 3, true);
});

spec.test('document should stop recurring at `repeatUntil`', async (ctx) => {
  let repeated = moment();
  const stop = moment().add(2500, 'milliseconds');
  const collection = ctx.get('collection');
  const cron = new MongoCron({
    collection,
    lockDuration: 0,
    onDocument: async (doc) => repeated = moment(),
    reprocessDelay: 1000,
  });
  await cron.start();
  await collection.insertOne({
    sleepUntil: new Date(),
    interval: '* * * * * *',
    repeatUntil: stop.toDate(),
  });
  await sleep(6000);
  await cron.stop();
  ctx.is(repeated.isAfter(stop), false);
});

spec.test('document with `autoRemove` should be deleted when completed', async (ctx) => {
  const collection = ctx.get('collection');
  const cron = new MongoCron({
    collection,
    lockDuration: 0,
  });
  await cron.start();
  await collection.insertOne({
    sleepUntil: new Date(),
    autoRemove: true,
  });
  await sleep(2000);
  await cron.stop();
  ctx.is(await collection.countDocuments(), 0);
});

export default spec;
