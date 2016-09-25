import test from 'ava';
import {MongoClient, ObjectId} from 'mongodb';
import {promise as sleep} from 'es6-sleep';
import {MongoCron, MongoCronManager} from '../dist';
import moment from 'moment';

test.beforeEach(async (t) => {
  t.context.db = await MongoClient.connect('mongodb://localhost:27017/test');
  t.context.csCollection = t.context.db.collection('jobs');
  t.context.poolsCollection = t.context.db.collection('pools');
  try { await t.context.csCollection.drop() } catch(e) {}
  try { await t.context.poolsCollection.drop() } catch(e) {}
});

test.afterEach(async (t) => {
  await t.context.db.close();
});

test.serial('document with `processable=true` triggers the `onDocument` handler', async (t) => {
  let processed = false;
  let c = new MongoCron({
    collection: t.context.csCollection,
    onDocument: async (doc) => processed = true
  });
  await c.start();
  await c.collection.insert({
    processable: true
  });
  await sleep(500);
  await c.stop();
  t.is(processed, true);
});

test.serial('locked documents should not be available for locking', async (t) => {
  let future = moment().add(5000, 'millisecond');
  let c = new MongoCron({
    collection: t.context.csCollection,
    lockDuration: 5000
  });
  await c.collection.insert({
    processable: true,
    lockUntil: future.toDate()
  });
  await sleep(500);
  await c.stop();
  t.is(await c.lockNext(), null);
});

test.serial('document with `waitUntil` should delay execution', async (t) => {
  let future = moment().add(3000, 'millisecond');
  let ranInFuture = false;
  let c = new MongoCron({
    collection: t.context.csCollection,
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
    collection: t.context.csCollection,
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
    collection: t.context.csCollection,
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
    collection: t.context.csCollection
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

test.serial('c with `watchedNamespaces` option should process only the specified namespaces', async (t) => {
  let c = new MongoCron({
    collection: t.context.csCollection,
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
