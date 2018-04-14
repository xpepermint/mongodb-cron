import { Collection } from 'mongodb';
export interface MongoCronCfg {
    collection: Collection | (() => Collection);
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
    sleepUntilFieldPath?: string;
    intervalFieldPath?: string;
    repeatUntilFieldPath?: string;
    autoRemoveFieldPath?: string;
}
export declare class MongoCron {
    protected running: boolean;
    protected processing: boolean;
    protected idle: boolean;
    readonly config: MongoCronCfg;
    constructor(config: MongoCronCfg);
    protected getCollection(): Collection;
    isRunning(): boolean;
    isProcessing(): boolean;
    isIdle(): boolean;
    start(): Promise<void>;
    stop(): Promise<void>;
    protected tick(): Promise<void>;
    protected lockNext(): Promise<any>;
    protected getNextStart(doc: any): Date;
    reschedule(doc: any): Promise<void>;
}
