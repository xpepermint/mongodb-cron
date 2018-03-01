import test from 'ava';
import * as moment from 'moment';
import { MongoClient, ObjectId } from 'mongodb';
import { promise as sleep } from 'es6-sleep';
import { MongoCron } from '..';

test.beforeEach(async (t) => {
  t.context.mongo = await MongoClient.connect('mongodb://localhost:27017');
  t.context.db = t.context.mongo.db('test');
  t.context.collection = t.context.db.collection('jobs');
  t.context.statisticsCollection = t.context.db.collection('cronStats');
  try { await t.context.collection.drop(); } catch (e) {}
  try { await t.context.statisticsCollection.drop(); } catch (e) {}
});

test.afterEach(async (t) => {
  await t.context.mongo.close();
});

test.serial('document with `sleepUntil` should be processed', async (t) => {
  let c = new MongoCron({
    collection: t.context.collection,
    onDocument: function() {}
  });
  await t.context.collection.insert([
    {sleepUntil: null},
    {sleepUntil: null},
    {sleepUntil: null}
  ]);
  await c.start();
  await sleep(3000);
  await c.stop();
  t.is(await t.context.collection.count({sleepUntil: {$exists: true}}), 0);
});

test.serial('cron should trigger event methods', async (t) => {
  let onStart = false;
  let onStop = false;
  let onDocument = false;
  let c = new MongoCron({
    collection: t.context.collection,
    onStart: async () => onStart = true,
    onStop: async () => onStop = true,
    onDocument: async (doc) => onDocument = true,
  });
  await t.context.collection.insert({
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

test.serial('cron should trigger the `onIdle` handler only once', async (t) => {
  let count = 0;
  let c = new MongoCron({
    collection: t.context.collection,
    onIdle: () => count++,
    onDocument: function() {}
  });
  await c.start();
  await sleep(1000);
  await c.stop();
  t.is(count, 1);
});

test.serial('locked documents should not be available for locking', async (t) => {
  let future = moment().add(5000, 'millisecond');
  let processed = false;
  let c = new MongoCron({
    collection: t.context.collection,
    lockDuration: 5000,
    onDocument: () => processed = true,
  });
  await t.context.collection.insert({
    sleepUntil: future.toDate()
  });
  await c.start();
  await sleep(500);
  await c.stop();
  t.is(processed, false);
});

test.serial('condition should filter lockable documents', async (t) => {
  let count = 0;
  let c = new MongoCron({
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
  let future = moment().add(3000, 'millisecond');
  let ranInFuture = false;
  let c = new MongoCron({
    collection: t.context.collection,
    onDocument: async (doc) => ranInFuture = moment() >= future
  });
  await c.start();
  await t.context.collection.insert({
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
  await t.context.collection.insert({
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
    statisticsCollection: t.context.statisticsCollection,
    collection: t.context.collection,
    onDocument: async (doc) => repeated++,
    reprocessDelay: 1000
  });
  await c.start();
  await t.context.collection.insert({
    sleepUntil: null,
    interval: '* * * * * *',
    repeatUntil: stop.toDate()
  });
  await sleep(3000);
  await c.stop();
  // It will run 3 times now because of the changes made on the next scheduling
  // date. Before it was skipping the first reschedule
  t.is(repeated, 3);
});

test.serial('document with `autoRemove` should be deleted when completed', async (t) => {
  let c = new MongoCron({
    collection: t.context.collection,
    onDocument: function() {}
  });
  await c.start();
  await t.context.collection.insert({
    sleepUntil: null,
    autoRemove: true
  });
  await sleep(2000);
  await c.stop();
  t.is(await t.context.collection.count(), 0);
});

test.serial('documents with `rescheduleIfSleepUntilIsNull` should be rescheduled and not run immediatly', async (t) => {
  let repeated = 0;
  let c = new MongoCron({
    collection: t.context.collection,
    onDocument: async (doc) => repeated++,
    reprocessDelay: 1000,
    rescheduleIfSleepUntilIsNull: true
  });
  const now = moment.utc();
  await c.start();
  await t.context.collection.insertMany([{
      name: 'test-month',
      sleepUntil: null,
      interval: now.clone().add(1, 'month').format('s m H D M *')
    }, {
      name: 'test-hour',
      sleepUntil: null,
      interval: now.clone().add(1, 'hour').format('s m H * * *')
    }, {
      name: 'test-day',
      sleepUntil: null,
      interval: now.clone().add(1, 'day').format('s m H D * *')
    }, {
      name: 'past-hour',
      sleepUntil: null,
      interval: now.clone().subtract(1, 'hour').format('s m H * * *')
  }]);
  await sleep(1000);
  await c.stop();
  now.milliseconds(0);
  let testMonth = await t.context.collection.findOne({name: 'test-month'});
  t.is(testMonth.sleepUntil.toISOString(), now.clone().add(1, 'month').toISOString());
  let testHour = await t.context.collection.findOne({name: 'test-hour'});
  t.is(testHour.sleepUntil.toISOString(), now.clone().add(1, 'hour').toISOString());
  let testDay = await t.context.collection.findOne({name: 'test-day'});
  t.is(testDay.sleepUntil.toISOString(), now.clone().add(1, 'day').toISOString());
  let pastHour = await t.context.collection.findOne({name: 'past-hour'});
  t.is(pastHour.sleepUntil.toISOString(), now.clone().subtract(1, 'hour').add(1, 'day').toISOString());
  // await new Promise((resolve) => {
  //   t.context.collection.find({}).toArray((err, arr) => {
  //     console.log(arr);
  //     resolve();
  //   });
  // });

  t.is(repeated, 0);
});

test.serial('reschedule to the next day', async (t) => {
  let repeated = 0;
  let c = new MongoCron({
    collection: t.context.collection,
    lockDuration: 5000,
    onDocument: async (doc) => repeated++,
    rescheduleIfSleepUntilIsNull: true
  });
  let now = moment.utc();
  let hr = now.hour();
  let mi = now.minute();
  await sleep(1000);
  await c.start();
  await t.context.collection.insert({
    sleepUntil: null,
    interval: `0 ${mi} ${hr} * * *`
  });
  await sleep(1000);
  await c.stop();
  let res = await t.context.collection.findOne({});
  let sleepUntil = moment(res.sleepUntil);
  let now2 = now.clone();
  now2.seconds(0);
  now2.millisecond(0);
  now2.add(1, 'day');
  sleepUntil.millisecond(0);
  t.is(repeated, 0);
  t.is(sleepUntil.toISOString(), now2.toISOString());
});

test.serial('reschedule to the next hour', async (t) => {
  let repeated = 0;
  let c = new MongoCron({
    collection: t.context.collection,
    onDocument: async (doc) => repeated++,
    rescheduleIfSleepUntilIsNull: true
  });
  let now = moment.utc();
  now.seconds(0);
  now.subtract(1, 'minute');
  let mi = now.minute();
  await c.start();
  await t.context.collection.insert({
    sleepUntil: null,
    interval: `0 ${mi} * * * *`
  });
  await sleep(1000);
  await c.stop();
  let res = await t.context.collection.findOne({});
  let sleepUntil = moment(res.sleepUntil);
  let now2 = now.clone();
  now2.seconds(0);
  now2.millisecond(0);
  now2.add(1, 'hour');
  sleepUntil.millisecond(0);
  t.is(repeated, 0);
  t.is(sleepUntil.toISOString(), now2.toISOString());
});

test.serial('start and reschedule correctly', async (t) => {
  let repeated = 0;
  let c = new MongoCron({
    collection: t.context.collection,
    onDocument: async (doc) => repeated++,
    nextDelay: 100
  });
  let now = moment.utc();
  now.add(2, 'second');
  await c.start();
  await t.context.collection.insert({
    sleepUntil: now.toDate(),
    interval: now.format('s m H D M *')
  });
  await sleep(3000);
  await c.stop();
  let res = await t.context.collection.findOne({});
  let sleepUntil = moment(res.sleepUntil);
  let now2 = now.clone();
  now2.millisecond(0);
  now2.add(1, 'year');
  sleepUntil.millisecond(0);
  t.is(repeated, 1);
  t.is(sleepUntil.toISOString(), now2.toISOString());
});

test.serial('return document with sleepUntil in the future', async (t) => {
  let sleepUntil = null;
  let c = new MongoCron({
    collection: t.context.collection,
    onDocument: async (doc) => { sleepUntil = doc.sleepUntil; }
  });
  await c.start();
  await t.context.collection.insert({
    sleepUntil: moment().subtract(1, 'hour').toDate(),
    interval: '* * * * * *'
  });
  await sleep(1000);
  await c.stop();
  t.false(sleepUntil == null);
  t.true(moment().isBefore(sleepUntil));
});

test.serial('return document with the original sleepUntil', async (t) => {
  let sleepUntil = null;
  let c = new MongoCron({
    collection: t.context.collection,
    onDocument: async (doc) => { sleepUntil = doc.sleepUntil; },
    returnOriginalDocument: true
  });
  await c.start();
  await t.context.collection.insert({
    sleepUntil: moment().subtract(1, 'hour').toDate(),
    interval: '* * * * * *'
  });
  await sleep(1000);
  await c.stop();
  t.false(sleepUntil == null);
  t.true(moment().isAfter(sleepUntil));
});

test.serial('should save statistics', async (t) => {
  let c = new MongoCron({
    collection: t.context.collection,
    statisticsCollection: t.context.statisticsCollection,
    onDocument: async (doc) => { await sleep(doc.sleepMs); },
    cronName: 'my beautiful cron'
  });
  await c.start();
  await t.context.collection.insertMany([{
      sleepUntil: null,
      interval: '* * * * * *',
      sleepMs: 200
    }, {
      sleepUntil: null,
      interval: moment().add(1, 'second').format('s m H * * *'),
      sleepMs: 1000
  }]);
  await sleep(3000);
  await c.stop();
  await new Promise((resolve) => {
    t.context.statisticsCollection.find({}).toArray((err, arr) => {
      // console.log(arr);
      t.is(arr.length, 4);
      t.is(arr[0].cronName, 'my beautiful cron');
      t.truthy(arr[0].executionTime);
      t.truthy(arr[0].serverName);
      resolve();
    });
  });
});
