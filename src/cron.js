import {ObjectId} from 'mongodb';
import moment from 'moment';
import later from 'later';
import {promise as sleep} from 'es6-sleep';
import dot from 'dot-object';

/*
* Main class for converting a collection into cron.
*/

export class MongoCron {

  /*
  * Class constructor.
  */

  constructor(options={}) {
    this._collection = options.collection;
    this._isRunning = false;
    this._isProcessing = false;

    this._lockDuration = options.lockDuration || 600000; // the time of milliseconds that each job gets locked (we have to make sure that the job completes in that time frame)

    this._nextDelay = options.nextDelay || 0; // wait before processing next job
    this._reprocessDelay = options.reprocessDelay || 0; // wait before processing the same job again
    this._idleDelay = options.idleDelay || 0; // when there is no jobs for processing, wait before continue

    this._onDocument = options.onDocument;
    this._onStart = options.onStart;
    this._onStop = options.onStop;
    this._onError = options.onError;

    this._processableFieldPath = options.processableFieldPath || 'processable';
    this._lockUntilFieldPath = options.lockUntilFieldPath || 'lockUntil';
    this._waitUntilFieldPath = options.waitUntilFieldPath || 'waitUntil';
    this._intervalFieldPath = options.intervalFieldPath || 'interval';
    this._repeatUntilFieldPath = options.repeatUntilFieldPath || 'repeatUntil';
    this._autoRemoveFieldPath = options.autoRemoveFieldPath || 'autoRemove';
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
  * Returns MongoDB collection which is used by this class.
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

      process.nextTick(this._loop.bind(this));
    }
  }

  /*
  * Stops the heartbit.
  */

  async stop() {
    this._isRunning = false;

    if (this._isProcessing) {
      await sleep(300);
      return process.nextTick(this.stop.bind(this));
    }

    if (this._onStop) {
      await this._onStop.call(this, this);
    }
  }

  /*
  * Private method which starts the heartbit loop.
  */

  async _loop() {
    if (!this._isRunning) return;

    this._isProcessing = true;
    try {
      await this._tick();
    } catch(e) {
      if (this._onError) {
        await this._onError.call(this, e, this);
      } else {
        console.log(e);
      }
    }
    this._isProcessing = false;

    await sleep(this._nextDelay);

    process.nextTick(this._loop.bind(this));
  }

  /*
  * Private method which handles heartbit's tick.
  */

  async _tick() {
    let doc = await this._lockNextDocument();

    if (!doc) { // no documents to process (idle state)
      return await sleep(this._idleDelay);
    }

    if (this._onDocument) {
      await this._onDocument.call(this, doc, this);
    }

    await this._rescheduleDocument(doc);
  }

  /*
  * A private method which prepares the next document for processing
  * and returns its updated version.
  */

  async _lockNextDocument() {
    let lockUntil = moment().add(this._lockDuration, 'millisecond').toDate();
    let currentDate = moment().toDate();

    let res = await this._collection.findOneAndUpdate(
      {
        $and: [
          {
            [this._processableFieldPath]: true
          },
          {
            $or: [
              {[this._lockUntilFieldPath]: {$lte: currentDate}},
              {[this._lockUntilFieldPath]: {$exists: false}}
            ]
          },
          {
            $or: [
              {[this._waitUntilFieldPath]: {$lte: currentDate}},
              {[this._waitUntilFieldPath]: {$exists: false}}
            ]
          }
        ]
      },
      {
        $set: {
          [this._lockUntilFieldPath]: lockUntil
        }
      },
      {
        sort: {[this._waitUntilFieldPath]: 1},
        returnOriginal: false
      }
    );
    return res.value;
  }

  /*
  * Returns the next date when the document can be processed or `null` if the
  * job is expired or not recurring.
  */

  getNextStart(doc) {
    if (!dot.pick(this._intervalFieldPath, doc)) { // not recurring job
      return null;
    }

    let start = moment(dot.pick(this._waitUntilFieldPath, doc));
    let future = moment().add(this._reprocessDelay, 'millisecond'); // date when the next start is possible
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
  * Private method which tries to reschedule a document, marks it as expired or
  * deletes a job if `autoRemove` is set to `true`.
  */

  async _rescheduleDocument(doc) {
    let nextStart = this.getNextStart(doc);
    let _id = ObjectId(doc._id);

    if (!nextStart && dot.pick(this._autoRemoveFieldPath, doc)) { // remove if auto-removable and not recuring
      await this._collection.deleteOne({_id});
    } else if (!nextStart) { // stop execution
      await this._collection.updateOne({_id}, {
        $unset: {
          [this._processableFieldPath]: 1,
          [this._lockUntilFieldPath]: 1,
          [this._waitUntilFieldPath]: 1
        }
      });
    } else { // reschedule for reprocessing in the future (recurring)
      await this._collection.updateOne({_id}, {
        $unset: {
          [this._lockUntilFieldPath]: 1,
        },
        $set: {
          [this._waitUntilFieldPath]: nextStart
        }
      });
    }
  }

}
