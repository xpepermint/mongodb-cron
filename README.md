![Build Status](https://travis-ci.org/xpepermint/mongodb-cron.svg?branch=master)&nbsp;[![NPM Version](https://badge.fury.io/js/mongodb-cron.svg)](https://badge.fury.io/js/mongodb-cron)&nbsp;[![Dependency Status](https://gemnasium.com/xpepermint/mongodb-cron.svg)](https://gemnasium.com/xpepermint/mongodb-cron)

# [mongodb](https://docs.mongodb.com/ecosystem/drivers/node-js/)-cron

> MongoDB collection as crontab

This package offers a simple API for scheduling tasks and running recurring jobs on [MongoDB](https://www.mongodb.org) collections. Any collection can be converted into a job queue or crontab list. You can even set multiple crontabs on the same collection. It uses the officially supported [Node.js driver for MongoDB](https://docs.mongodb.com/ecosystem/drivers/node-js/). Beside the general crontab features, the package provides some additional functionality as are execution speed limiting, quotas and processing pools. It's fast, minimizes processing overhead and it uses atomic commands to ensure safe job executions even in cluster environments.

<img src="giphy.gif" />

## Setup

```
$ npm install --save ioredis mongodb mongodb-cron
```

## Example

Jobs are documents that live in a MongoDB collection. The `MongoCron` class can convert any collection into a job queue.

Below, is a simple example to show the benefit of using this package in your Node.js projects. To make things as clean as possible, we use [Babel](https://babeljs.io/) with ES7 features, thus we can wrap our code into the async block.

```js
(async function() {
  // code that follows
})().catch(console.error);
```

Start by initializing the database connection.

```js
import {MongoClient} from 'mongodb';

let db = await MongoClient.connect('mongodb://localhost:27017/test');
```

Continue by initializing and starting a collection worker.

```js
import {MongoCron} from 'mongodb-cron';

let collection = db.collection('jobs');
let cron = new MongoCron({
  collection,
  onDocument: async (doc, cron) => console.log(doc),
  onError: async (err, cron) => console.log(err)
});

cron.start(); // start processing
```

We can now create our first job.

```js
let job = await collection.insert({
  name: 'Ricky Martin Show',
  processable: true
});
```

After inserting the document above to the database, the `onDocument` callback, which we've defined earlier, will immediately be triggered. This is how a collection becomes a job queue. We have a very basic example here so read next sections for advanced features.

## One-time Jobs

For creating a one-time job we only need to set the `processable` field to `true`. This will immediately trigger the processing of a document.

```js
let job = await collection.insert({
  ...
  processable: true
});
```

When the processing of a document starts the `lockUntil` field is set which locks the document for a certain amount of time in which (we know that) the document will be processed (lock timeout is configurable). This prevents race conditions and ensures that a job is always processed by a single process at a time.

When the processing ends, the `processable` and `lockUntil` fields are removed. If the processing is interrupted (e.g. server shutdown), the `lockUntil` field may stay on the document but has no effect as soon as its value becomes the past thus the system will automatically recover and transparently continue.

## Deferred Execution

Job execution can be delayed by setting the `waitUntil` field.

```js
let job = await collection.insert({
  ...
  waitUntil: new Date('2016-01-01')
});
```

## Recurring Jobs

By setting the `interval` field we define a recurring job.

```js
let job = await collection.insert({
  ...
  interval: '* * * * * *' // every second
});
```

The interval above consists of 6 values.

```
* * * * * *
┬ ┬ ┬ ┬ ┬ ┬
│ │ │ │ │ └── day of week (0 - 7) (0 or 7 is Sun)
│ │ │ │ └──── month (1 - 12)
│ │ │ └────── day of month (1 - 31)
│ │ └──────── hour (0 - 23)
│ └────────── minute (0 - 59)
└──────────── second (0 - 59)
```

A recurring job will repeat endlessly unless we limit that by setting the `repeatUntil` field. When a job expires it stops repeating by removing the `processable` field.

```js
let job = await collection.insert({
  ...
  interval: '* * * * * *',
  repeatUntil: new Date('2020-01-01')
});
```

## Auto-removable Jobs

A job can automatically remove itself from the database when the processing completes. To configure that, we need to set the `autoRemove` field to `true`.

```js
let job = await collection.insert({
  ...
  autoRemove: true
});
```

## Processing Pools

A job can have a namespace. A namespace represents a name of a processing pool or better a work group to which a job belongs to. By default a worker processes all documents in a collection, regardless the value of a `namespace` field. We can limit the processing to only selected namespaces by setting the `watchedNamespaces` field. Note that jobs without the namespace are always included in the list.

```js
let cron = new MongoCron({
  ...
  watchedNamespaces: ['us', 'eu'] // process only documents where namespace field equals to us or   
});

let job = await collection.insert({
  ...
  namespace: 'us' // processing pool name
});
```

## Namespace Dedication

A worker can lock a particular namespace. This means that other workers or cluster processes are not allowed to process jobs of that namespace in that time until the namespace lock expires or is released by the worker itself.

When a namespace is locked a worker becomes an owner of this namespace. In this case a worker will only process jobs of the namespace which he owns until there are jobs with that namespace available in a database collection. When all jobs of that namespace are processed, the namespace is released and a worker restarts by locking the next available namespace.

This feature requires a [Redis](redis.io) connection (we use [ioredis](https://github.com/luin/ioredis) but any other package with the support for Promises can be used).

```js
import Redis from 'ioredis';

let job = await collection.insert({
  ...
  redis: new Redis(), // required
  namespaceDedication: true
});
```

## Using Quota (to-do)

By default a worker tries to process jobs as quickly as possible and never stops. MongoCron supports time based quota. Thus you can set a limit on how many jobs is allowed to be processed in a particular time frame (e.g. 100 jobs per hour).

This feature requires a [Redis](redis.io) connection (we use [ioredis](https://github.com/luin/ioredis) but any other package with the support for Promises can be used).

```js
import Redis from 'ioredis';

let job = await collection.insert({
  ...
  redis: new Redis(), // required
  minutelyQuota: 10,
  hourlyQuota: 100,
  dailyQuota: 1000,
  weeklyQuota: 5000
  monthlyQuota: 20000
});
```

## API

**new MongoCron({collection, onStart, onStop, onDocument, onError, nextDelay, reprocessDelay, idleDelay, lockDuration, processableFieldPath, lockUntilFieldPath, waitUntilFieldPath, intervalFieldPath, repeatUntilFieldPath, autoRemoveFieldPath, manager})**
> The core class for converting a MongoDB collection into a job queue.

| Option | Type | Required | Default | Description
|--------|------|----------|---------|------------
| collection | Object | Yes | - | MongoDB collection object.
| redis | Object | Yes, for some features | - | Redis class instance.
| onStart | Function/Promise | No | - | A method which is triggered when the cron is started.
| onStop | Function/Promise | No | - | A method which is triggered when the cron is stopped.
| onDocument | Function/Promise | No | - | A method which is triggered when a document should be processed.
| onError | Function/Promise | No | - | A method which is triggered in case of an error.
| nextDelay | Integer | No | 0 | A variable which tells how fast the next job can be processed.
| reprocessDelay | Integer | No | 0 | A variable which tells how many milliseconds the worker should wait before processing the same job again in case the job is a recurring job.
| idleDelay | Integer | No | 0 | A variable which tells how many milliseconds the worker should wait before checking for new jobs after all jobs has been processed.
| lockDuration | Integer | No | 600000 | A number of milliseconds for which each job gets locked for (we have to make sure that the job completes in that time frame).
| watchedNamespaces | Array | No | [] | A list of namespaces to watch (jobs without a namespace are watched by default).
| namespaceDedication | Boolean | No | false | Locks namespace before processing starts so other workers or node cluster processes can't process the same namespace, then it processes only that locked namespace until jobs for this namespace are available.
| namespaceFieldPath | String | No | namespace | The `namespace` field path.
| processableFieldPath | String | No | processing | The `processing` field path.
| lockUntilFieldPath | String | No | lockUntil | The `lockUntil` field path.
| waitUntilFieldPath | String | No | waitUntil | The `waitUntil` field path.
| intervalFieldPath | String | No | interval | The `interval` field path.
| repeatUntilFieldPath | String | No | repeatUntil | The `repeatUntil` field path.
| autoRemoveFieldPath | String | No | autoRemove | The `autoRemove` field path.
| manager | MongoCronManager | No | - | Manager instance for processing jobs using pools.

```js
let cron = new MongoCron({
  collection: db.collection('jobs'),
  onStart: async (cron) => {},
  onStop: async (cron) => {},
  onDocument: async (doc, cron) => {},
  onError: async (err, cron) => {},
  nextDelay: 1000,
  reprocessDelay: 1000,
  idleDelay: 10000,
  lockDuration: 600000,
  watchedNamespaces: ['foo'],
  namespaceFieldPath: 'cron.namespace',
  processableFieldPath: 'cron.processing',
  lockUntilFieldPath: 'cron.lockUntil',
  waitUntilFieldPath: 'cron.waitUntil',
  intervalFieldPath: 'cron.interval',
  repeatUntilFieldPath: 'cron.repeatUntil',
  autoRemoveFieldPath: 'cron.autoRemove',
  manager: null
});
```

**cron.start()**:Promise
> Starts the cron processor.

**cron.stop()**:Promise
> Stops the cron processor.

**cron.isRunning**:Boolean
> Returns true if the cron is started.

**cron.isProcessing**:Boolean
> Returns true if cron is processing a document.

**cron.lockNext**:Document
> Locks the next job document for processing and returns it.

## Processing Speed

Processing speed can be reduced when more and more documents are added into the collection. We can maintain the speed by creating indexes.

```js
await collection.createIndex({
  namespace: 1,
  processable: 1,
  lockUntil: 1,
  waitUntil: 1
});
```

## Best Practice

* Make your jobs idempotent and transactional. [Idempotency](https://en.wikipedia.org/wiki/Idempotence) means that your job can safely execute multiple times.
* Run this package in cluster mode. Design your jobs in a way that you can run lots of them in parallel.

## Licence

```
Copyright (c) 2016 Kristijan Sedlak <xpepermint@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
