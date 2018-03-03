![Build Status](https://travis-ci.org/xpepermint/mongodb-cron.svg?branch=master)&nbsp;[![NPM Version](https://badge.fury.io/js/mongodb-cron.svg)](https://badge.fury.io/js/mongodb-cron)&nbsp;[![Dependency Status](https://gemnasium.com/xpepermint/mongodb-cron.svg)](https://gemnasium.com/xpepermint/mongodb-cron)

# [mongodb](https://docs.mongodb.com/ecosystem/drivers/node-js/)-cron

> MongoDB collection as crontab

This package offers a simple API for scheduling tasks and running recurring jobs on [MongoDB](https://www.mongodb.org) collections. Any collection can be converted into a job queue or crontab list. It uses the officially supported [Node.js driver for MongoDB](https://docs.mongodb.com/ecosystem/drivers/node-js/). It's fast, minimizes processing overhead and it uses atomic commands to ensure safe job executions even in cluster environments.

This is a light weight open source package for NodeJS written with [TypeScript](https://www.typescriptlang.org). It's actively maintained, well tested and already used in production environments. The source code is available on [GitHub](https://github.com/xpepermint/mongodb-cron) where you can also find our [issue tracker](https://github.com/xpepermint/mongodb-cron/issues).

<img src="https://github.com/xpepermint/mongodb-cron/raw/master/giphy.gif" />

## Installation

This is a module for [Node.js](http://nodejs.org/) and can be installed via [npm](https://www.npmjs.com). It depends on the [mongodb](https://docs.mongodb.com/ecosystem/drivers/node-js/) package and uses promises.

```
$ npm install --save mongodb mongodb-cron
```

## Example

Below, is a simple example to show the benefit of using this package in your Node.js projects.

Let's start by initializing the database connection.

```js
import { MongoClient } from 'mongodb';

const mongo = await MongoClient.connect('mongodb://localhost:27017');
const db = mongo.db('test');
```

Continue by initializing and starting a the worker.

```js
import { MongoCron } from 'mongodb-cron';

const collection = db.collection('jobs');
const cron = new MongoCron({
  collection, // a collection where jobs are stored
  onDocument: async (doc) => console.log(doc), // triggered on job processing
  onError: async (err) => console.log(err), // triggered on error
});

cron.start(); // start processing
```

We can now create our first job.

```js
const job = await collection.insert({
  sleepUntil: new Date('2016-01-01'),
});
```

When the processing starts the `onDocument` handler (defined earlier) is triggered. We have a very basic example here so please continue reading.

## Documentation

The `MongoCron` class converts a collection into a job queue. Jobs are represented by the documents stored in a MongoDB collection. When cron is started it loops through the collection and processes available jobs one by one.

A job should have at least the `sleepUntil` field. Cron processes only documents where this field exists, other documents are ignored.

### One-time Jobs

To create a one-time job we only need to define the required field `sleepUntil`. When this filed is set to `null`, the processing starts immediately.

```js
const job = await collection.insert({
  sleepUntil: null,
});
```

When the processing of a document starts the `sleepUntil` field is updated to a new date in the future. This locks the document for a certain amount of time in which the processing must complete (lock duration is configurable). This mechanism prevents possible race conditions and ensures that a job is always processed by only one process at a time.

When the processing ends, the `sleepUntil` field is removed.

If cron is unexpectedly interrupted during the processing of a job (e.g. server shutdown), the system automatically recovers and transparently restarts.

## Deferred Execution

We can schedule job execution for a particular time in the future by setting the `sleepUntil` field to the desired date.

```js
const job = await collection.insert({
  ...
  sleepUntil: new Date('2016-01-01'), // start on 2016-01-01
});
```

## Recurring Jobs

By setting the `interval` field we define a recurring job.

```js
const job = await collection.insert({
  ...
  interval: '* * * * * *', // every second
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
const job = await collection.insert({
  ...
  interval: '* * * * * *',
  repeatUntil: new Date('2020-01-01'),
});
```

### Making `sleepUntil = null` not start immediately

By adding the option `rescheduleIfSleepUntilIsNull: true` will make the job run only on the next schedule time, for example, if now is 12PM and this document is added:

```js
{
    interval: '0 0 13 * * *'
    sleepUntil: null
}
```
and `rescheduleIfSleepUntilIsNull: true` the job will wait until 1 PM to run


## Auto-removable Jobs

A job can automatically remove itself from the collection when the processing completes. To configure that, we need to set the `autoRemove` field to `true`.

```js
const job = await collection.insert({
  ...
  autoRemove: true,
});
```


## Statistics

It's possible to store some statistics into `statisticsCollection`.

A typical document will look like:

```js
  {
    document: {
      /* the original document */
      _id: ObjectID('9733e815fc8eafc108585d99c64fb449'),
      interval: '* * * * * *',
      sleepMs: 200,
      sleepUntil: null
    },
    jobStart: ISODate('2018-03-02T13:54:36.800Z'),
    jobEnd: ISODate('2018-03-02T13:54:37.004Z'),
    executionTime: 204,
    serverName: 'ip-192-168-1-106.ec2.internal',
    cronName: 'my beautiful cron'
}

```

It's also a good practice to expire documents, this can be achieved by setting
an index on the collection with a TTS.

```js
db.statisticsCollection.createIndex(
  { "jobStart": 1 },
  { expireAfterSeconds: 604800 }
);
```

## API

**new MongoCron({ collection, condition, onStart, onStop, onDocument, onError, nextDelay, reprocessDelay, idleDelay, lockDuration, sleepUntilFieldPath, intervalFieldPath, repeatUntilFieldPath, autoRemoveFieldPath, rescheduleIfSleepUntilIsNull, returnOriginalDocument, cronName })**
> The core class for converting a MongoDB collection into a job queue.

| Option | Type | Required | Default | Description
|--------|------|----------|---------|------------
| collection | Object | Yes | - | MongoDB collection object.
| statisticsCollection | Object | No | - | MongoDB collection object.
| condition | Object | No | null | Additional query condition.
| onStart | Function/Promise | No | - | A method which is triggered when the cron is started.
| onStop | Function/Promise | No | - | A method which is triggered when the cron is stopped.
| onDocument | Function/Promise | No | - | A method which is triggered when a document should be processed.
| onIdle | Function/Promise | No | - | A method which is triggered when all jobs in a collection have been processed.
| onError | Function/Promise | No | - | A method which is triggered in case of an error.
| nextDelay | Integer | No | 0 | A variable which tells how fast the next job can be processed.
| reprocessDelay | Integer | No | 0 | A variable which tells how many milliseconds the worker should wait before processing the same job again in case the job is a recurring job.
| idleDelay | Integer | No | 0 | A variable which tells how many milliseconds the worker should wait before checking for new jobs after all jobs has been processed.
| lockDuration | Integer | No | 600000 | A number of milliseconds for which each job gets locked for (we have to make sure that the job completes in that time frame).
| sleepUntilFieldPath | String | No | sleepUntil | The `sleepUntil` field path.
| intervalFieldPath | String | No | interval | The `interval` field path.
| repeatUntilFieldPath | String | No | repeatUntil | The `repeatUntil` field path.
| autoRemoveFieldPath | String | No | autoRemove | The `autoRemove` field path.
| rescheduleIfSleepUntilIsNull | Boolean | No | false | Do not call `onDocument` when sleepUntil is null
| returnOriginalDocument | Boolean | No | false | Passes the original document to `onDocument`, original document will have the sleepUntil in the past. The default is to return the modified document with the sleepUntil in the future
| cronName | String | No | mongodb-cron | Will log the cron name into `statisticsCollection`, useful if you have multiple crons and want to use the same collection to store statistics

```js
import { MongoClient } from 'mongodb';

const mongo = await MongoClient.connect('mongodb://localhost:27017/test');

const cron = new MongoCron({
  collection: db.collection('jobs'),
  statisticsCollection: db.collection('jobs_stats'),
  onStart: async () => {},
  onStop: async () => {},
  onDocument: async (doc) => {},
  onIdle: async (doc) => {},
  onError: async (err) => {},
  nextDelay: 1000,
  reprocessDelay: 1000,
  idleDelay: 10000,
  lockDuration: 600000,
  sleepUntilFieldPath: 'cron.sleepUntil',
  intervalFieldPath: 'cron.interval',
  repeatUntilFieldPath: 'cron.repeatUntil',
  autoRemoveFieldPath: 'cron.autoRemove',
  rescheduleIfSleepUntilIsNull: false,
  returnOriginalDocument: false,
  cronName: 'my cron',
});
```

**cron.start()**:Promise
> Starts the cron processor.

**cron.stop()**:Promise
> Stops the cron processor.

**cron.isRunning()**:Boolean
> Returns true if the cron is started.

**cron.isProcessing()**:Boolean
> Returns true if cron is processing a document.

**cron.isIdle()**:Boolean
> Returns true if the cron is in idle state.

## Processing Speed

Processing speed can be reduced when more and more documents are added into the collection. We can maintain the speed by creating indexes.

```js
await collection.createIndex({
  sleepUntil: 1, // the `sleepUntil` field path, set by the sleepUntilFieldPath
}, {
  sparse: true,
});
```

Don't forget to adjust the index definition when using your custom query `condition`.

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
