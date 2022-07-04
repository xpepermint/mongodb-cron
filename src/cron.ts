import * as parser from 'cron-parser';
import * as dot from 'dot-object';
import { promise as sleep } from 'es6-sleep';
import * as moment from 'moment';
import { Collection } from 'mongodb';

/**
 * Configuration object interface.
 */
export interface MongoCronCfg {
  collection: Collection | (() => Collection);
  condition?: any;
  nextDelay?: number; // wait before processing next job
  reprocessDelay?: number; // wait before processing the same job again
  idleDelay?: number; // when there is no jobs for processing, wait before continue
  lockDuration?: number; // the time of milliseconds that each job gets locked (we have to make sure that the job completes in that time frame)
  sleepUntilFieldPath?: string;
  intervalFieldPath?: string;
  repeatUntilFieldPath?: string;
  autoRemoveFieldPath?: string;
  onDocument?(doc: any): (any | Promise<any>);
  onStart?(doc: any): (any | Promise<any>);
  onStop?(): (any | Promise<any>);
  onIdle?(): (any | Promise<any>);
  onError?(err: any): (any | Promise<any>);
}

/**
 * Main class for converting a collection into cron.
 */
export class MongoCron {
  protected running = false;
  protected processing = false;
  protected idle = false;
  protected readonly config: MongoCronCfg;

  /**
   * Class constructor.
   * @param config Configuration object.
   */
  public constructor(config: MongoCronCfg) {
    this.config = {
      onDocument: (doc) => doc,
      onError: console.error,
      nextDelay: 0,
      reprocessDelay: 0,
      idleDelay: 0,
      lockDuration: 600000,
      sleepUntilFieldPath: 'sleepUntil',
      intervalFieldPath: 'interval',
      repeatUntilFieldPath: 'repeatUntil',
      autoRemoveFieldPath: 'autoRemove',
      ...config,
    };
  }

  /**
   * Returns the collection instance (the collection can be provided in
   * the config as an instance or a function).
   */
  protected getCollection(): Collection {
    return typeof this.config.collection === 'function'
      ? this.config.collection()
      : this.config.collection;
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
    if (!this.running) { return; }
    await sleep(this.config.nextDelay);
    if (!this.running) { return; }

    this.processing = true;
    try {
      const doc = await this.lockNext(); // locking next job
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
          await this.config.onDocument.call(this, doc, this);
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
    const sleepUntil = moment().add(this.config.lockDuration, 'milliseconds').toDate();
    const currentDate = moment().toDate();

    const res = await this.getCollection().findOneAndUpdate({
      $and: [
        { [this.config.sleepUntilFieldPath]: { $exists: true, $ne: null }},
        { [this.config.sleepUntilFieldPath]: { $not: { $gt: currentDate } } },
        this.config.condition,
      ].filter((c) => !!c),
    }, {
      $set: { [this.config.sleepUntilFieldPath]: sleepUntil },
    }, {
      returnDocument: 'before', // return original document to calculate next start based on the original value
    });
    return res.value;
  }

  /**
   * Returns the next date when a job document can be processed or `null` if the
   * job has expired.
   * @param doc Mongo document.
   */
  protected getNextStart(doc: any): Date {
    if (!dot.pick(this.config.intervalFieldPath, doc)) { // not recurring job
      return null;
    }

    const available = moment(dot.pick(this.config.sleepUntilFieldPath, doc)); // first available next date
    const future = moment(available).add(this.config.reprocessDelay, 'milliseconds'); // date when the next start is possible

    try {
      const interval = parser.parseExpression(dot.pick(this.config.intervalFieldPath, doc), {
        currentDate: future.toDate(),
        endDate: dot.pick(this.config.repeatUntilFieldPath, doc),
      });
      const next = interval.next().toDate();
      const now = moment().toDate();
      return next < now ? now : next; // process old recurring jobs only once
    } catch (err) {
      return null;
    }
  }

  /**
   * Tries to reschedule a job document, to mark it as expired or to delete a job
   * if `autoRemove` is set to `true`.
   * @param doc Mongo document.
   */
  public async reschedule(doc: any): Promise<void> {
    const nextStart = this.getNextStart(doc);
    const _id = doc._id;

    if (!nextStart && dot.pick(this.config.autoRemoveFieldPath, doc)) { // remove if auto-removable and not recuring
      await this.getCollection().deleteOne({ _id });
    } else if (!nextStart) { // stop execution
      await this.getCollection().updateOne({ _id }, {
        $set: { [this.config.sleepUntilFieldPath]: null },
      });
    } else { // reschedule for reprocessing in the future (recurring)
      await this.getCollection().updateOne({ _id }, {
        $set: { [this.config.sleepUntilFieldPath]: nextStart },
      });
    }
  }

}
