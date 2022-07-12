import { Collection } from 'mongodb';

/**
 * Default document type
 */
export interface MongoCronJob {
  sleepUntil: null | Date;
  interval?: string;
  repeatUntil?: Date;
  autoRemove?: boolean;
}

/**
 * Configuration object interface.
 */
export interface MongoCronCfg<T = MongoCronJob> {
  collection: Collection<T> | (() => Collection<T>);
  condition?: any;
  nextDelay?: number; // wait before processing next job
  reprocessDelay?: number; // wait before processing the same job again
  idleDelay?: number; // when there is no jobs for processing, wait before continue
  lockDuration?: number; // the time of milliseconds that each job gets locked (we have to make sure that the job completes in that time frame)
  sleepUntilFieldPath?: string & keyof T;
  intervalFieldPath?: string & keyof T;
  repeatUntilFieldPath?: string & keyof T;
  autoRemoveFieldPath?: string & keyof T;
  onDocument?(doc: any): any | Promise<any>;
  onStart?(doc: any): any | Promise<any>;
  onStop?(): any | Promise<any>;
  onIdle?(): any | Promise<any>;
  onError?(err: any): any | Promise<any>;
}
