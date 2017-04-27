import { MongoClient, ObjectId } from "mongodb";
import { MongoCron } from "../src";

/*
* Number of documents.
*/

const SAMPLE_SIZE = process.argv[2] ? parseInt(process.argv[2]) : 1000;

/*
* TEST: One-time jobs.
*/

async function testOneTimeJobs(mongo) {
  let time = 0;
  let collection = mongo.collection("jobs");

  try { await collection.drop() } catch(e) {}

  console.log(`> Creating ${SAMPLE_SIZE} documents ...`);

  time = Date.now();
  for (let i=0; i < SAMPLE_SIZE; i++) {
    await collection.insert({
      sleepUntil: null
    });
  }
  console.log(`> Done (${Date.now() - time}ms)`);

  console.log(`> Processing ...`);

  time = Date.now();
  await new Promise((resolve, reject) => {
    let cron = new MongoCron({
      collection,
      onError: (err, cron) => console.log(err),
      onIdle: () => {
        cron.stop().then(() => {
          console.log(`> Done (${Date.now() - time}ms)`);
          resolve();
        });
      },
      nextDelay: 0,
      reprocessDelay: 0,
      idleDelay: 0,
      lockDuration: 600000
    });
    cron.start();
  });
}

/*
* Starts testing.
*/

(async function() {
  let mongo = await MongoClient.connect("mongodb://localhost:27017/test");

  await testOneTimeJobs(mongo);
  await mongo.close();
})().catch(console.error);
