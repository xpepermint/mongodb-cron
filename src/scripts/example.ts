import { promise as sleep } from 'es6-sleep';
import * as moment from 'moment';
import { MongoClient } from 'mongodb';
import { MongoCron } from '..';

(async function() {
  const mongo = await MongoClient.connect('mongodb://localhost:27017');
  const db = mongo.db('test');
  const collection = db.collection('jobs');

  const cron = new MongoCron({
    collection,
    onDocument: (doc) => console.log('onDocument', doc),
    onError: (err) => console.log(err),
    onStart: () => console.log('started ...'),
    onStop: () => console.log('stopped'),
    nextDelay: 1000,
    reprocessDelay: 1000,
    idleDelay: 10000,
    lockDuration: 600000,
  });

  await collection.insertMany([
    { name: 'Job #3',
      sleepUntil: moment().add(3, 'seconds').toDate(),
    },
    { name: 'Job #1',
      sleepUntil: null,
    },
    { name: 'Job #2',
      sleepUntil: moment().add(2, 'seconds').toDate(),
    },
    { name: 'Job #4',
      sleepUntil: moment().add(8, 'seconds').toDate(),
    },
  ]);

  cron.start();
  await sleep(30000);
  cron.stop();

  process.exit(0);

})().catch(console.error);
