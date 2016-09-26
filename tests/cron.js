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
  await t.context.db.close();
  await t.context.redis.quit();
});

test.serial('document with `processable=true` should be processed', async (t) => {
  let c = new MongoCron({
    collection: t.context.collection
  });
  await c.collection.insert([
    {processable: true},
    {processable: true},
    {processable: true}
  ]);
  await c.start();
  await sleep(1000);
  await c.stop();
  t.is(await c.collection.count({processable: true}), 0);
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
    processable: true
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
    processable: true,
    lockUntil: future.toDate()
  });
  await sleep(500);
  await c.stop();
  t.is(processed, false);
});

test.serial('document with `waitUntil` should delay execution', async (t) => {
  let future = moment().add(3000, 'millisecond');
  let ranInFuture = false;
  let c = new MongoCron({
    collection: t.context.collection,
    onDocument: async (doc) => ranInFuture = moment() >= future
  });
  await c.start();
  await c.collection.insert({
    processable: true,
    waitUntil: future.toDate()
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
    processable: true,
    interval: '* * * * * *'
  });
  await sleep(3000);
  await c.stop();
  t.is(repeated >= 2, true);
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
    processable: true,
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
    processable: true,
    autoRemove: true
  });
  await sleep(2000);
  await c.stop();
  t.is((await c.collection.count()), 0);
});

test.serial('cron with`watchedNamespaces` option should process only the specified namespaces', async (t) => {
  let c = new MongoCron({
    collection: t.context.collection,
    watchedNamespaces: ['bar']
  });
  await c.start();
  await c.collection.insert({
    namespace: 'foo',
    processable: true
  });
  await c.collection.insert({
    namespace: 'bar',
    processable: true
  });
  await sleep(2000);
  await c.stop();
  t.is(await c.collection.count({processable: true}), 1);
  t.is(await c.collection.count({namespace: 'foo'}), 1);
});

test.serial('cron with`namespaceDedication` should prevent other processes from handle jobs with the same namespaces', async (t) => {
  let c0 = new MongoCron({
    collection: t.context.collection,
    redis: t.context.redis,
    onDocument: () => sleep(3000),
    namespaceDedication: true
  });
  let c1 = new MongoCron({
    collection: t.context.collection,
    redis: t.context.redis,
    namespaceDedication: true,
    idleDelay: 5000
  });
  await c0.collection.insert({
    namespace: 'foo',
    processable: true
  });
  await c0.collection.insert({
    namespace: 'foo',
    processable: true
  });
  await c0.start();
  await sleep(500);
  await c1.start();
  await sleep(500);
  t.is(c0.isProcessing, true);
  t.is(c1.isIdle, true);
  await sleep(2500);
  t.is(await c0.collection.count({processable: true}), 1);
  await c0.stop();
  await c1.stop();
});
