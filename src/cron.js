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
    this._isRunning = false;
    this._isProcessing = false;
    this._isIdle = false;

    this._collection = options.collection;
    this._redis = options.redis;

    this._onDocument = options.onDocument;
    this._onStart = options.onStart;
    this._onStop = options.onStop;
    this._onError = options.onError || console.error;

    this._nextDelay = options.nextDelay || 0; // wait before processing next job
    this._reprocessDelay = options.reprocessDelay || 0; // wait before processing the same job again
    this._idleDelay = options.idleDelay || 0; // when there is no jobs for processing, wait before continue
    this._lockDuration = options.lockDuration || 600000; // the time of milliseconds that each job gets locked (we have to make sure that the job completes in that time frame)
    this._watchedNamespaces = options.watchedNamespaces;
    this._namespaceDedication = options.namespaceDedication || false;

    this._namespaceFieldPath = options.namespaceFieldPath || 'namespace';
    this._sleepUntilFieldPath = options.sleepUntilFieldPath || 'sleepUntil';
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
  * Returns the Redis instance.
  */

  get redis() {
    return this._redis;
  }

  /*
  * Creates required collection indexes.
  */

  async setup() {
    await this._collection.createIndex({
      [this._sleepUntilFieldPath]: 1
    }, {sparse: true});

    await this._collection.createIndex({
      [this._namespaceFieldPath]: 1,
      [this._sleepUntilFieldPath]: 1
    }, {sparse: true});
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

    if (this._isProcessing || this._isIdle) {
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

  async _tick(namespace) {
    if (!this._isRunning) return;
    await sleep(this._nextDelay);
    if (!this._isRunning) return;

    this._isProcessing = true;
    try {
      if (this._namespaceDedication && typeof namespace === 'undefined') { // managing namespace
        namespace = await this._lockNamespace();
      }

      let doc = await this._lockJob(namespace); // locking next job
      if (!doc) {
        if (namespace) { // processing for this namespace ended
          await this._unlockNamespace(namespace);
        } else if (namespace === null) { // all namespaces (including the null) have been processed
          this._isIdle = true;
          await sleep(this._idleDelay);
          this._isIdle = false;
        }
        namespace = undefined; // no documents left, find new namespace
      } else {
        if (this._onDocument) {
          await this._onDocument.call(this, doc, this);
        }
        await this._reschedule(doc);
      }
    } catch(e) {
      await this._onError.call(this, e, this);
    }
    this._isProcessing = false;

    // run next heartbit tick
    process.nextTick(() => this._tick(namespace));
  }

  /*
  * Locks the next namespace for processing and returns it.
  */

  async _lockNamespace() {
    let currentDate = moment().toDate();

    let filters = [];
    if (this._watchedNamespaces) {
      filters.push(
        {[this._namespaceFieldPath]: {$exists: true}},
        {[this._namespaceFieldPath]: {$in: this._watchedNamespaces}}
      );
    }
    filters.push(
      {[this._sleepUntilFieldPath]: {$exists: true}},
    );

    let cursor = await this._collection.aggregate([
      {
        $match: {
          $and: filters
        }
      },
      {
        $group: {
          _id: `$${this._namespaceFieldPath}`,
          maxLockUntil: {$max: `$${this._sleepUntilFieldPath}`}
        }
      },
      {
        $match: {
          maxLockUntil: {$not: {$gt: currentDate}}
        }
      }
      // IMPORTANT: sorting is not needed here
    ]).batchSize(1);

    let namespace = null;
    do {
      let doc = await cursor.nextObject();
      if (!doc) {
        break;
      }
      let res = await this._redis.set(doc._id, '0', 'PX', this._lockDuration, 'NX');
      if (res === 'OK') {
        namespace = doc._id;
        break;
      }
    } while(true);

    await cursor.close();

    return namespace;
  }

  /*
  * Unlocks the namespace.
  */

  async _unlockNamespace(namespace) {
    if (namespace) {
      await this._redis.del(namespace);
    }
  }

  /*
  * Locks the next job document for processing and returns it.
  */

  async _lockJob(namespace) {
    let sleepUntil = moment().add(this._lockDuration, 'millisecond').toDate();
    let currentDate = moment().toDate();

    let filters = [];
    if (typeof namespace !== 'undefined') {
      filters.push(
        {[this._namespaceFieldPath]: {$exists: true}},
        {[this._namespaceFieldPath]: namespace}
      );
    } else if (this._watchedNamespaces) {
      filters.push(
        {[this._namespaceFieldPath]: {$exists: true}},
        {[this._namespaceFieldPath]: {$in: this._watchedNamespaces}}
      );
    }
    filters.push(
      {[this._sleepUntilFieldPath]: {$exists: true}},
      {[this._sleepUntilFieldPath]: {$not: {$gt: currentDate}}}
    );

    let res = await this._collection.findOneAndUpdate({
      $and: filters
    }, {
      $set: {
        [this._sleepUntilFieldPath]: sleepUntil
      }
    }, {
      returnOriginal: false
      // IMPORTANT: sorting is not needed here
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

    let start = moment(dot.pick(this._sleepUntilFieldPath, doc)).subtract(this._lockDuration, 'millisecond'); // get processing start date (before lock duration was added)
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
