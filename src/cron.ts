import * as later from 'later';
import * as dot from 'dot-object';
import * as moment from 'moment';
import * as _ from 'lodash';
import * as os from 'os';
import { ObjectId, Collection, Document } from 'mongodb';
import { promise as sleep } from 'es6-sleep';

/**
 * Configuration object interface.
 */
export interface MongoCronCfg {
  collection: Collection;
  statisticsCollection?: Collection;
  condition?: any;
  onDocument?: (doc: any) => (any | Promise<any>);
  onStart?: (doc: any) => (any | Promise<any>);
  onStop?: () => (any | Promise<any>);
  onIdle?: () => (any | Promise<any>);
  onError?: (err: any) => (any | Promise<any>);
  nextDelay?: number; // wait before processing next job
  reprocessDelay?: number; // wait before processing the same job again
  idleDelay?: number; // when there is no jobs for processing, wait before continue
  lockDuration?: number; // the time of milliseconds that each job gets locked (we have to make sure that the job completes in that time frame)
  rescheduleIfSleepUntilIsNull?: boolean; // will not call onDocument when sleepUntil is null, just reschedule next run
  returnOriginalDocument?: boolean; // when true passes the original document to onDocument
  sleepUntilFieldPath?: string;
  intervalFieldPath?: string;
  repeatUntilFieldPath?: string;
  autoRemoveFieldPath?: string;
  cronName?: string;
}

/**
 * Main class for converting a collection into cron.
 */
export class MongoCron {
  protected running: boolean = false;
  protected processing: boolean = false;
  protected idle: boolean = false;
  readonly config: MongoCronCfg;
  private serverName: string;

  /**
   * Class constructor.
   * @param {MongoCronCfg} config Configuration object.
   */
  public constructor(config: MongoCronCfg) {
    this.config = {
      statisticsCollection: null,
      onDocument: console.log,
      onError: console.error,
      nextDelay: 0,
      reprocessDelay: 0,
      idleDelay: 0,
      lockDuration: 600000,
      rescheduleIfSleepUntilIsNull: false,
      returnOriginalDocument: false,
      sleepUntilFieldPath: 'sleepUntil',
      intervalFieldPath: 'interval',
      repeatUntilFieldPath: 'repeatUntil',
      autoRemoveFieldPath: 'autoRemove',
      cronName: 'mongodb-cron',
      ...config,
    };
    this.serverName = os.hostname();
  }

  /**
   * Tells if the process is started.
   */
  public isRunning() {
    return this.running;
  }

  /**
   * Tells if a document is processing.
   */
  public isProcessing() {
    return this.processing;
  }

  /**
   * Tells if the process is idle.
   */
  public isIdle() {
    return this.idle;
  }

  /**
   * Starts the heartbit.
   */
  public async start() {
    if (!this.running) {
      this.running = true;

      if (this.config.onStart) {
        await this.config.onStart.call(this, this);
      }

      process.nextTick(this.tick.bind(this));
    }
  }

  /**
   * Stops the heartbit.
   */
  public async stop() {
    this.running = false;

    if (this.processing) {
      await sleep(300);
      return process.nextTick(this.stop.bind(this)); // wait until processing is complete
    }

    if (this.config.onStop) {
      await this.config.onStop.call(this, this);
    }
  }

  /**
   * Private method which runs the heartbit tick.
   */
  protected async tick() {
    if (!this.running) return;
    await sleep(this.config.nextDelay);
    if (!this.running) return;

    this.processing = true;
    try {
      let [doc, lockedSleepUntil] = await this.lockNext(); // locking next job
      if (!doc) {
        this.processing = false;
        if (!this.idle) {
          this.idle = true;
          if (this.config.onIdle) {
            await this.config.onIdle.call(this, this);
          }
        }
        await sleep(this.config.idleDelay);
      } else {
        this.idle = false;
        if (this.config.onDocument) {
          if (!(this.config.rescheduleIfSleepUntilIsNull
              && dot.pick(this.config.sleepUntilFieldPath, doc) === null
              && dot.pick(this.config.intervalFieldPath, doc))
          ) {
            let clonedDoc = _.cloneDeep(doc);
            if (!this.config.returnOriginalDocument) {
              // Set the sleepUntil on the cloned document
              // This is the default: returning the sleepUntil is the future (now+lockDuration)
              dot.del(this.config.sleepUntilFieldPath, clonedDoc);
              dot.str(this.config.sleepUntilFieldPath, lockedSleepUntil, clonedDoc);
            }
            const jobStart = moment.utc().toDate();
            await this.config.onDocument.call(this, clonedDoc, this);
            if (this.config.statisticsCollection) {
              this.saveStatistics(doc, jobStart, moment.utc().toDate());
            }
          }
        }
        await this.reschedule(doc);
        this.processing = false;
      }
    } catch (err) {
      await this.config.onError.call(this, err, this);
    }

    process.nextTick(() => this.tick());
  }

  /**
   * Locks the next job document for processing and returns it.
   */
  protected async lockNext() {
    let sleepUntil = moment().add(this.config.lockDuration, 'millisecond').toDate();
    let currentDate = moment().toDate();

    let res = await this.config.collection.findOneAndUpdate({
      $and: [
        {[this.config.sleepUntilFieldPath]: {$exists: true}},
        {[this.config.sleepUntilFieldPath]: {$not: {$gt: currentDate}}},
        this.config.condition,
      ].filter((c) => !!c)
    }, {
      $set: { [this.config.sleepUntilFieldPath]: sleepUntil },
    }, {
      returnOriginal: true, // by default, documents are ordered by the sleepUntil field
      // changed this and if returnOriginalDocument is false (default) will recalculate the sleepUntil before passes to onDocument
    });
    return [res.value, sleepUntil];
  }

  /**
   * Returns the next date when a job document can be processed or `null` if the
   * job has expired.
   */
  protected getNextStart(doc) {
    if (!dot.pick(this.config.intervalFieldPath, doc)) { // not recurring job
      return null;
    }

    let start = moment(dot.pick(this.config.sleepUntilFieldPath, doc)); // get processing start date
    let future = moment().add(this.config.reprocessDelay, 'millisecond'); // date when the next start is possible
    if (start >= future) { // already in future
      return start.toDate();
    }

    try { // new date
      let schedule = later.parse.cron(dot.pick(this.config.intervalFieldPath, doc), true);
      let dates = later.schedule(schedule).next(2, future.toDate(), dot.pick(this.config.repeatUntilFieldPath, doc));
      let next = dates[0];
      if (this.config.reprocessDelay === 0 && future.isSame(next)) { // Avoid rescheduling to the same moment when no reprocessDelay
        next = dates.length > 0 ? dates[1] : null;
      }
      return next instanceof Date ? next : null;
    } catch (err) {
      return null;
    }
  }

  /*
   * Tries to reschedule a job document, to mark it as expired or to delete a job
   * if `autoRemove` is set to `true`.
   */
  public async reschedule(doc) {
    let nextStart = this.getNextStart(doc);
    let _id = ObjectId(doc._id);

    if (!nextStart && dot.pick(this.config.autoRemoveFieldPath, doc)) { // remove if auto-removable and not recuring
      await this.config.collection.deleteOne({_id});
    } else if (!nextStart) { // stop execution
      let res = await this.config.collection.updateOne({_id}, {
        $unset: {
          [this.config.sleepUntilFieldPath]: 1
        }
      });
    } else { // reschedule for reprocessing in the future (recurring)
      await this.config.collection.updateOne({_id}, {
        $set: {
          [this.config.sleepUntilFieldPath]: nextStart
        }
      });
    }
  }

  /**
   * Saves statistics to statistics collection
   */
  private async saveStatistics(doc, jobStart, jobEnd) {
    this.config.statisticsCollection.insert({
      document: doc,
      jobStart,
      jobEnd,
      executionTime: jobEnd.getTime() - jobStart.getTime(),
      serverName: this.serverName,
      cronName: this.config.cronName
    });
  }

}
