import { MongoClient } from "mongodb";
import { MongoCron } from "../src";
import { promise as sleep } from "es6-sleep";
import moment from "moment";

(async function() {
  let mongo = await MongoClient.connect("mongodb://localhost:27017/test");

  let cron = new MongoCron({
    collection: mongo.collection("jobs"),
    onDocument: (doc, cron) => console.log("onDocument", doc),
    onError: (err, cron) => console.log(err),
    onStart: (cron) => console.log("started ..."),
    onStop: (cron) => console.log("stopped"),
    nextDelay: 1000,
    reprocessDelay: 1000,
    idleDelay: 10000,
    lockDuration: 600000
  });

  setTimeout(function() {
    cron.start();
    try { cron.collection.drop() } catch(e) {}
  }, 0);

  setTimeout(function() {
    cron.collection.insert([
      { name: "Job #3",
        sleepUntil: moment().add(2, "seconds").toDate()
      },
      { name: "Job #1",
        sleepUntil: null
      },
      { name: "Job #2",
        sleepUntil: moment().add(1, "seconds").toDate()
      },
      { name: "Job #4",
        sleepUntil: moment().add(3, "seconds").toDate()
      },
    ]);
  }, 2000);

  setTimeout(function() {
    cron.stop();
  }, 7000);

})().catch(console.error);
