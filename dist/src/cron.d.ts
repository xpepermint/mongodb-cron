import { Collection } from 'mongodb';
export interface MongoCronCfg {
    collection: Collection;
    statisticsCollection?: Collection;
    condition?: any;
    onDocument?: (doc: any) => (any | Promise<any>);
    onStart?: (doc: any) => (any | Promise<any>);
    onStop?: () => (any | Promise<any>);
    onIdle?: () => (any | Promise<any>);
    onError?: (err: any) => (any | Promise<any>);
    nextDelay?: number;
    reprocessDelay?: number;
    idleDelay?: number;
    lockDuration?: number;
    rescheduleIfSleepUntilIsNull?: boolean;
    returnOriginalDocument?: boolean;
    sleepUntilFieldPath?: string;
    intervalFieldPath?: string;
    repeatUntilFieldPath?: string;
    autoRemoveFieldPath?: string;
    cronName?: string;
}
export declare class MongoCron {
    protected running: boolean;
    protected processing: boolean;
    protected idle: boolean;
    readonly config: MongoCronCfg;
    private serverName;
    constructor(config: MongoCronCfg);
    isRunning(): boolean;
    isProcessing(): boolean;
    isIdle(): boolean;
    start(): Promise<void>;
    stop(): Promise<void>;
    protected tick(): Promise<void>;
    protected lockNext(): Promise<any[]>;
    protected getNextStart(doc: any): Date;
    reschedule(doc: any): Promise<void>;
    private saveStatistics(doc, jobStart, jobEnd);
}
