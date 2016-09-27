![Build Status](https://travis-ci.org/xpepermint/mongodb-cron.svg?branch=master)&nbsp;[![NPM Version](https://badge.fury.io/js/mongodb-cron.svg)](https://badge.fury.io/js/mongodb-cron)&nbsp;[![Dependency Status](https://gemnasium.com/xpepermint/mongodb-cron.svg)](https://gemnasium.com/xpepermint/mongodb-cron)

# [mongodb](https://docs.mongodb.com/ecosystem/drivers/node-js/)-cron

> MongoDB collection as crontab

This package offers a simple API for scheduling tasks and running recurring jobs on [MongoDB](https://www.mongodb.org) collections. Any collection can be converted into a job queue or crontab list. It uses the officially supported [Node.js driver for MongoDB](https://docs.mongodb.com/ecosystem/drivers/node-js/).

Beside the general crontab features, the package provides some advanced functionality as are execution speed limiting, quota and job name-spacing. It's fast, minimizes processing overhead and it uses atomic commands to ensure safe job executions even in cluster environments.

<img src="giphy.gif" />

## Setup

This is a module for [Node.js](http://nodejs.org/) and can be installed via [npm](https://www.npmjs.com/package/ioredis-quota). The package requires the  [mongodb](https://docs.mongodb.com/ecosystem/drivers/node-js/) package. Some features also require the [ioredis](https://github.com/luin/ioredis) package.

```
$ npm install --save ioredis mongodb mongodb-cron
```

## Example

Below, is a simple example to show the benefit of using this package in your Node.js projects. To make things as clean as possible, we use [Babel](https://babeljs.io/) with ES7 features, thus we can wrap our code into the async block.

```js
(async function() {
  // code that follows
})().catch(console.error);
```

Start by initializing the database connection.

```js
import {MongoClient} from 'mongodb';

let mongo = await MongoClient.connect('mongodb://localhost:27017/test');
```

Continue by initializing and starting a the worker.

```js
import {MongoCron} from 'mongodb-cron';

let collection = mongo.collection('jobs');
let cron = new MongoCron({
  collection, // a collection where jobs are stored
  onDocument: async (doc, cron) => console.log(doc), // triggered on job processing
  onError: async (err, cron) => console.log(err) // triggered on error
});

cron.start(); // start processing
```

We can now create our first job.

```js
let job = await collection.insert({
  sleepUntil: new Date('2016-01-01')
});
```

When the processing starts the `onDocument` handler (defined earlier) is triggered. We have a very basic example here so please continue reading.

## Documentation

The `MongoCron` class converts a collection into a job queue. Jobs are represented by the documents stored in a MongoDB collection. When cron is started it loops through the collection and processes available jobs one by one.

Jobs have a required field `sleepUntil` which defines the job start date. Cron processes only the documents where this field exists, other documents are ignored.

### One-time Jobs

To create a one-time job we only need to set the required field `sleepUntil` field to `null`. This will start processing the job immediately.

```js
let job = await collection.insert({
  sleepUntil: null
});
```

When the processing of a document starts the `sleepUntil` field is updated to a new date in the future. This locks the document for a certain amount of time in which the processing must complete (lock duration is configurable). This mechanism prevents possible race conditions and ensures that a job is always processed by only one process at a time.

When the processing ends, the `sleepUntil` field is removed.

If cron is unexpectedly interrupted during the processing of a job (e.g. server shutdown), the system automatically recovers and transparently restarts.

## Deferred Execution

We can schedule job execution for a particular time in the future by setting the `sleepUntil` field to the desired date.

```js
let job = await collection.insert({
  ...
  sleepUntil: new Date('2016-01-01') // start on 2016-01-01
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

A job can automatically remove itself from the collection when the processing completes. To configure that, we need to set the `autoRemove` field to `true`.

```js
let job = await collection.insert({
  ...
  autoRemove: true
});
```

## Processing Pools

A job can have a namespace. A namespace represents a name of a processing pool or better a work group to which a job belongs to. By default workers process all documents in a collection, regardless the value of a `namespace` field. We can limit the processing to only the selected namespaces by setting the `watchedNamespaces` field.

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

A worker can lock a particular namespace. This means that other workers or cluster processes are not allowed to process jobs of that namespace until the namespace lock expires or is released by the worker itself.

When this feature is turned on, only jobs containing a namespace field are processed.

When a namespace is locked a worker becomes an owner of this namespace. In this case a worker will continue processing jobs of the namespace which he owns until there are jobs with that namespace available in a database collection. When all jobs of that namespace are processed, the namespace is released and a worker restarts by locking the next available namespace.

This feature requires a [Redis](redis.io) connection (we use [ioredis](https://github.com/luin/ioredis) but any other package with the support for Promises can be used).

```js
import Redis from 'ioredis';

let job = await collection.insert({
  ...
  redis: new Redis(), // required
  namespaceDedication: true
});
```

## Namespace Quota (to-do)

By default a worker tries to process jobs as quickly as possible and never stops. MongoCron supports time based quota which refers to a namespace. Thus you can set a limit on how many jobs per namespace is allowed to be processed in a particular time frame (e.g. 100 jobs per hour).

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

**new MongoCron({collection, onStart, onStop, onDocument, onError, nextDelay, reprocessDelay, idleDelay, lockDuration, sleepUntilFieldPath, intervalFieldPath, repeatUntilFieldPath, autoRemoveFieldPath, manager})**
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
| sleepUntilFieldPath | String | No | sleepUntil | The `sleepUntil` field path.
| intervalFieldPath | String | No | interval | The `interval` field path.
| repeatUntilFieldPath | String | No | repeatUntil | The `repeatUntil` field path.
| autoRemoveFieldPath | String | No | autoRemove | The `autoRemove` field path.

```js
import Redis from 'ioredis';
import {MongoClient} from 'mongodb';

let mongo = await MongoClient.connect('mongodb://localhost:27017/test');
let collection = mongo.collection('jobs');

let redis = new Redis();

let cron = new MongoCron({
  collection,
  redis,
  onStart: async (cron) => {},
  onStop: async (cron) => {},
  onDocument: async (doc, cron) => {},
  onError: async (err, cron) => {},
  nextDelay: 1000,
  reprocessDelay: 1000,
  idleDelay: 10000,
  lockDuration: 600000,
  watchedNamespaces: ['foo'],
  namespaceDedication: true,
  namespaceFieldPath: 'cron.namespace',
  sleepUntilFieldPath: 'cron.sleepUntil',
  intervalFieldPath: 'cron.interval',
  repeatUntilFieldPath: 'cron.repeatUntil',
  autoRemoveFieldPath: 'cron.autoRemove'
});
```

**cron.setup()**:Promise
> Creates required collection indexes.

**cron.start()**:Promise
> Starts the cron processor.

**cron.stop()**:Promise
> Stops the cron processor.

**cron.isRunning**:Boolean
> Returns true if the cron is started.

**cron.isProcessing**:Boolean
> Returns true if cron is processing a document.

**cron.isIdle**:Boolean
> Returns true if the cron is in idle state.

## Processing Speed

Processing speed can be reduced when more and more documents are added into the collection. We can maintain the speed by creating indexes.

```js
await collection.createIndex({
  namespace: 1,
  sleepUntil: 1
}, {
  sparse: true
});
```

Use the `cron.setup()` method to create required indexes.

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
