import { ObjectId } from "mongodb";
import moment from "moment";
import later from "later";
import { promise as sleep } from "es6-sleep";
import dot from "dot-object";

/*
* Main class for converting a collection into cron.
*/

export class MongoCron {

  /*
  * Class constructor.
  */

  constructor(options={}) {
    this._isRunning = false;
    this._isProcessing = false;
    this._isIdle = false;

    this._collection = options.collection;

    this._onDocument = options.onDocument;
    this._onStart = options.onStart;
    this._onStop = options.onStop;
    this._onIdle = options.onIdle;
    this._onError = options.onError || console.error;

    this._nextDelay = options.nextDelay || 0; // wait before processing next job
    this._reprocessDelay = options.reprocessDelay || 0; // wait before processing the same job again
    this._idleDelay = options.idleDelay || 0; // when there is no jobs for processing, wait before continue
    this._lockDuration = options.lockDuration || 600000; // the time of milliseconds that each job gets locked (we have to make sure that the job completes in that time frame)

    this._sleepUntilFieldPath = options.sleepUntilFieldPath || "sleepUntil";
    this._intervalFieldPath = options.intervalFieldPath || "interval";
    this._repeatUntilFieldPath = options.repeatUntilFieldPath || "repeatUntil";
    this._autoRemoveFieldPath = options.autoRemoveFieldPath || "autoRemove";
  }

  /*
  * Returns true if the cron is started.
  */

  get isRunning() {
    return this._isRunning;
  }

  /*
  * Returns true if the cron is processing a document.
  */

  get isProcessing() {
    return this._isProcessing;
  }

  /*
  * Returns true if the cron is in idle state.
  */

  get isIdle() {
    return this._isIdle;
  }

  /*
  * Returns the MongoDB collection.
  */

  get collection() {
    return this._collection;
  }

  /*
  * Starts the heartbit.
  */

  async start() {
    if (!this._isRunning) {
      this._isRunning = true;

      if (this._onStart) {
        await this._onStart.call(this, this);
      }

      process.nextTick(this._tick.bind(this));
    }
  }

  /*
  * Stops the heartbit.
  */

  async stop() {
    this._isRunning = false;

    if (this._isProcessing) {
      await sleep(300);
      return process.nextTick(this.stop.bind(this)); // wait until processing is complete
    }

    if (this._onStop) {
      await this._onStop.call(this, this);
    }
  }

  /*
  * Private method which runs the heartbit tick.
  */

  async _tick() {
    if (!this._isRunning) return;
    await sleep(this._nextDelay);
    if (!this._isRunning) return;

    this._isProcessing = true;
    try {
      let doc = await this._lockNext(); // locking next job
      if (!doc) {
        this._isProcessing = false;
        if (!this._isIdle) {
          this._isIdle = true;
          if (this._onIdle) {
            await this._onIdle.call(this, this);
          }
        }
        await sleep(this._idleDelay);
      } else {
        this._isIdle = false;
        if (this._onDocument) {
          await this._onDocument.call(this, doc, this);
        }
        await this._reschedule(doc);
        this._isProcessing = false;
      }
    } catch(e) {
      await this._onError.call(this, e, this);
    }

    process.nextTick(() => this._tick());
  }

  /*
  * Locks the next job document for processing and returns it.
  */

  async _lockNext() {
    let sleepUntil = moment().add(this._lockDuration, "millisecond").toDate();
    let currentDate = moment().toDate();

    let res = await this._collection.findOneAndUpdate({
      $and: [
        {[this._sleepUntilFieldPath]: {$exists: true}},
        {[this._sleepUntilFieldPath]: {$not: {$gt: currentDate}}}
      ]
    }, {
      $set: {
        [this._sleepUntilFieldPath]: sleepUntil
      }
    }, {
      returnOriginal: false
      // by default, documents are ordered by the sleepUntil field
    });
    return res.value;
  }

  /*
  * Returns the next date when a job document can be processed or `null` if the
  * job has expired.
  */

  _getNextStart(doc) {
    if (!dot.pick(this._intervalFieldPath, doc)) { // not recurring job
      return null;
    }

    let start = moment(dot.pick(this._sleepUntilFieldPath, doc)).subtract(this._lockDuration, "millisecond"); // get processing start date (before lock duration was added)
    let future = moment().add(this._reprocessDelay, "millisecond"); // date when the next start is possible
    if (start >= future) { // already in future
      return start.toDate();
    }

    try { // new date
      let schedule = later.parse.cron(dot.pick(this._intervalFieldPath, doc), true);
      let dates = later.schedule(schedule).next(2, future.toDate(), dot.pick(this._repeatUntilFieldPath, doc));
      let next = dates[1];
      return next instanceof Date ? next : null;
    } catch (err) {
      return null;
    }
  }

  /*
  * Tries to reschedule a job document, to mark it as expired or to delete a job
  * if `autoRemove` is set to `true`.
  */

  async _reschedule(doc) {
    let nextStart = this._getNextStart(doc);
    let _id = ObjectId(doc._id);

    if (!nextStart && dot.pick(this._autoRemoveFieldPath, doc)) { // remove if auto-removable and not recuring
      await this._collection.deleteOne({_id});
    } else if (!nextStart) { // stop execution
      let res = await this._collection.updateOne({_id}, {
        $unset: {
          [this._sleepUntilFieldPath]: 1
        }
      });
    } else { // reschedule for reprocessing in the future (recurring)
      await this._collection.updateOne({_id}, {
        $set: {
          [this._sleepUntilFieldPath]: nextStart
        }
      });
    }
  }

}
