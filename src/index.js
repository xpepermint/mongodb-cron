import {ObjectId} from 'mongodb';
import moment from 'moment';
import later from 'later';
import {promise as sleep} from 'es6-sleep';

/*
* Main class for converting a collection into cron.
*/

export class MongoCron {

  /*
  * Class constructor.
  */

  constructor(options={}) {
    this._collection = options.collection;

    this._enabledFieldPath = options.enabledFieldPath || 'enabled';
    this._waitUntilFieldPath = options.waitUntilFieldPath || 'waitUntil';
    this._expireAtFieldPath = options.expireAtFieldPath || 'expireAt';
    this._intervalFieldPath = options.intervalFieldPath || 'interval';
    this._deleteExpiredFieldPath = options.deleteExpiredFieldPath || 'deleteExpired';
    this._lockedFieldPath = options.lockedFieldPath || 'locked';
    this._startedAtFieldPath = options.startedAtFieldPath || 'startedAt';
    this._finishedAtFieldPath = options.finishedAtFieldPath || 'finishedAt';

    this._onDocument = options.onDocument;
    this._onStart = options.onStart;
    this._onStop = options.onStop;
    this._onError = options.onError;

    this._nextDelay = options.nextDelay || 0; // wait before processing next job
    this._reprocessDelay = options.reprocessDelay || 0; // wait before processing the same job again
    this._idleDelay = options.idleDelay || 0; // when there is no jobs for processing, wait before continue

    this._running = false;
    this._processing = false;
  }

  /*
  * Returns true if the cron is running.
  */

  get running() {
    return this._running;
  }

  /*
  * Returns true if the cron is processing a document.
  */

  get processing() {
    return this._processing;
  }

  /*
  * Starts the heartbit.
  */

  async start() {
    if (!this.running) {
      this._running = true;

      if (this._onStart) {
        await this._onStart(this);
      }

      process.nextTick(this._loop.bind(this));
    }
    return this;
  }

  /*
  * Starts the heartbit.
  */

  async stop({force=false}={}) {
    this._running = false;

    if (force) {
      this._processing = false;
    }

    do {
      if (!this._processing) {
        break;
      } else {
        await sleep(300);
      }
    } while(true);

    if (this._onStop) {
      await this._onStop(this);
    }

    return this;
  }

  /*
  * Private method which starts the heartbit loop.
  */

  async _loop() {
    do {
      if (!this._running) break;

      this._processing = true;
      try {
        await this._tick();
      } catch(e) {
        if (this._onError) {
          await this._onError(e, this);
        } else {
          console.log(e);
        }
      }
      this._processing = false;

      await sleep(this._nextDelay);
    } while(true);
  }

  /*
  * Private method which handles heartbit's tick.
  */

  async _tick() {
    let doc = await this.lockNextDocument();

    if (!doc) { // no documents to process (idle state)
      return await sleep(this._idleDelay);
    }

    if (this._onDocument) {
      await this._onDocument(doc, this);
    }
    await this.rescheduleDocument(doc);
  }

  /*
  * A private method which prepares the next document for processing
  * and returns its updated version.
  */

  async lockNextDocument() {
    let time = new Date();
    let res = await this._collection.findOneAndUpdate(
      {
        $and: [
          {
            [this._enabledFieldPath]: true,
            [this._lockedFieldPath]: {$exists: false}
          },
          {
            $or: [
              {[this._waitUntilFieldPath]: {$lte: time}},
              {[this._waitUntilFieldPath]: {$exists: false}}
            ]
          },
          {
            $or: [
              {[this._expireAtFieldPath]: {$gte: time}},
              {[this._expireAtFieldPath]: {$exists: false}}
            ]
          }
        ]
      },
      {
        $set: {[this._lockedFieldPath]: true, [this._startedAtFieldPath]: time}
      },
      {
        sort: {[this._waitUntilFieldPath]: 1},
        returnOriginal: false
      }
    );
    return res.value;
  }

  /*
  * Returns the next date when the job should be processed or `null` if the job
  * is expired or not recurring.
  */

  getNextStart(doc) {
    if (!doc[this._intervalFieldPath]) { // not recurring job
      return null;
    }

    let start = moment(doc[this._waitUntilFieldPath]);
    let future = moment().add(this._reprocessDelay, 'millisecond'); // date when the next start is possible
    if (start >= future) { // already in future
      return start.toDate();
    }

    try { // new date
      let schedule = later.parse.cron(doc[this._intervalFieldPath], true);
      let dates = later.schedule(schedule).next(2, future.toDate(), doc[this._expireAtFieldPath]);
      let next = dates[1];
      return next instanceof Date ? next : null;
    } catch (err) {
      return null;
    }
  }

  /*
  * Private method which tries to reschedule a document, marks it as expired or
  * deletes a job if `deleteExpired` is set to `true`.
  */

  async rescheduleDocument(doc) {
    let nextStart = this.getNextStart(doc);
    let _id = ObjectId(doc._id);

    if (!nextStart && doc[this._deleteExpiredFieldPath]) {
      await this._collection.deleteOne({_id});
    } else if (!nextStart) {
      await this._collection.updateOne({_id}, {
        $unset: {[this._lockedFieldPath]: 1, [this._waitUntilFieldPath]: 1},
        $set: {[this._finishedAtFieldPath]: new Date(), [this._enabledFieldPath]: false}
      });
    } else {
      await this._collection.updateOne({_id}, {
        $unset: {[this._lockedFieldPath]: 1},
        $set: {[this._finishedAtFieldPath]: new Date(), [this._waitUntilFieldPath]: nextStart}
      });
    }
  }

}
