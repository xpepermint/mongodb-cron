![Build Status](https://travis-ci.org/xpepermint/mongodb-cron.svg?branch=master)&nbsp;[![NPM Version](https://badge.fury.io/js/mongodb-cron.svg)](https://badge.fury.io/js/mongodb-cron)&nbsp;[![Dependency Status](https://gemnasium.com/xpepermint/mongodb-cron.svg)](https://gemnasium.com/xpepermint/mongodb-cron)

# [mongodb](https://docs.mongodb.com/ecosystem/drivers/node-js/)-cron

> MongoDB collection as crontab

This package offers a simple API for scheduling tasks and running recurring jobs on multiple [MongoDB](https://www.mongodb.org) collections. Any collection can be converted into a crontab list. You can even set multiple crontabs on the same collection. It uses the officially supported Node.js [driver for MongoDB](https://docs.mongodb.com/ecosystem/drivers/node-js/). It's fast, minimizes processing overhead and it uses atomic commands to ensure safe job executions in cluster environments.

<img src="giphy.gif" />

## Setup

```
$ npm install --save mongodb-cron
```

## Quick Start

Below, we create a simple example to show the benefit of using this package in your Node.js projects. To make things as clean as possible, we use [Babel](https://babeljs.io/) with ES7 features thus we can wrap our code into the async block.

```js
(async function() {
  // code that follows
})().catch(console.error);
```

Start by initializing the database connection.

```js
import {MongoClient} from 'mongodb';

let db = await MongoClient.connect('mongodb://localhost:27017/test');
let collection = db.collection('events');
```

Continue by initializing and starting a cron worker.

```js
import {MongoCron} from 'mongodb-cron';

let cron = new MongoCron({
  collection,
  onDocument: async (doc, cron) => console.log(doc),
  onError: async (err, cron) => console.log(err)
});

cron.start(); // start processing
```

We can now create our first job.

```js
let res = await collection.insert({
  name: 'Ricky Martin Show',
  enabled: true
});
```

After inserting the document above to the database, the `onDocument` callback, which we've defined earlier, will immediately be triggered. This is how any collection can become a cron job queue. We have a very basic example here so read the next section for advanced features.

## Configuration & Details

We can create a **one-time** or **recurring** jobs. Every time the document processing starts the `startedAt` field is set to the latest date and the `locked` field is set to `true`. When the processing ends the `finishedAt` field is set to the current date and the `locked` field is removed.

We can create a one-time job which will start processing immediately just by setting the `enabled` field to `true`.

```js
collection.insert({
  ...
  enabled: true
});
```

Job execution can be delayed by setting the `waitUntil` field.

```js
collection.insert({
  ...
  waitUntil: new Date('2016-01-01')
});
```

By setting the `interval` field we define a recurring job.

```js
collection.insert({
  ...
  interval: '* * * * * *' // every second
});
```

The interval above consists of 6 values.

```
*    *    *    *    *    *
┬    ┬    ┬    ┬    ┬    ┬
│    │    │    │    │    |
│    │    │    │    │    └ day of week (0 - 7) (0 or 7 is Sun)
│    │    │    │    └───── month (1 - 12)
│    │    │    └────────── day of month (1 - 31)
│    │    └─────────────── hour (0 - 23)
│    └──────────────────── minute (0 - 59)
└───────────────────────── second (0 - 59)
```

A recurring job will repeat endlessly unless we limit that by setting the `expireAt` field. When a job expires it stops repeating. If we also set `deleteExpired` field to `true`, a job is automatically deleted from the database collection.

```js
collection.insert({
  enabled: true,
  waitUntil: new Date('2016-01-01'),
  interval: '* * * * * *',
  expireAt: new Date('2020-01-01'),
  deleteExpired: true
});
```

Processing speed can be reduced when more and more documents are added into the collection. We can maintain the speed by creating an index.

```js
collection.createIndex({
  enabled: 1,
  locked: 1,
  waitUntil: 1,
  expireAt: 1
});
```

The `MongoCron` class accepts several configuration options.

```js
let cron = new MongoCron({
  // (required) MongoDB collection object.
  collection: db.collection('events'),

  // (default=enabled) The `enabled` field path.
  enabledFieldPath: 'cron.enabled',
  // (default=waitUntil) The `waitUntil` field path.
  waitUntilFieldPath: 'cron.waitUntil',
  // (default=expireAt) The `expireAt` field path.
  expireAtFieldPath: 'cron.waitUntil',
  // (default=interval) The `interval` field path.
  intervalFieldPath: 'cron.interval',
  // (default=deleteExpired) The `deleteExpired` field path.
  deleteExpiredFieldPath: 'cron.deleteExpired',

  // A method which is triggered when the cron is started.
  onStart: async (cron) => {},
  // A method which is triggered when the cron is stopped.
  onStop: async (cron) => {},
  // A method which is triggered when a document should be processed.
  onDocument: async (doc, cron) => {},
  // A method which is triggered in case of an error.
  onError: async (err, cron) => {},

  // (default=0) A variable which tells how fast the next job can be processed.
  nextDelay: 1000,
  // (default=0) A variable which tells how many milliseconds the worker should 
  // wait before processing the same job again in case the job is a recurring job.
  reprocessDelay: 1000,
  // (default=0) A variable which tells how many milliseconds the worker should 
  // wait before checking for new jobs after all jobs has been processed.
  idleDelay: 1000
});
```
