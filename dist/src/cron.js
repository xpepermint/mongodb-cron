"use strict";
var __assign = (this && this.__assign) || Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
    }
    return t;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = y[op[0] & 2 ? "return" : op[0] ? "throw" : "next"]) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [0, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var later = require("later");
var dot = require("dot-object");
var moment = require("moment");
var _ = require("lodash");
var os = require("os");
var mongodb_1 = require("mongodb");
var es6_sleep_1 = require("es6-sleep");
var MongoCron = (function () {
    function MongoCron(config) {
        this.running = false;
        this.processing = false;
        this.idle = false;
        this.config = __assign({ statisticsCollection: null, onDocument: console.log, onError: console.error, nextDelay: 0, reprocessDelay: 0, idleDelay: 0, lockDuration: 600000, rescheduleIfSleepUntilIsNull: false, returnOriginalDocument: false, sleepUntilFieldPath: 'sleepUntil', intervalFieldPath: 'interval', repeatUntilFieldPath: 'repeatUntil', autoRemoveFieldPath: 'autoRemove', cronName: 'mongodb-cron' }, config);
        this.serverName = os.hostname();
    }
    MongoCron.prototype.isRunning = function () {
        return this.running;
    };
    MongoCron.prototype.isProcessing = function () {
        return this.processing;
    };
    MongoCron.prototype.isIdle = function () {
        return this.idle;
    };
    MongoCron.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.running) return [3, 3];
                        this.running = true;
                        if (!this.config.onStart) return [3, 2];
                        return [4, this.config.onStart.call(this, this)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        process.nextTick(this.tick.bind(this));
                        _a.label = 3;
                    case 3: return [2];
                }
            });
        });
    };
    MongoCron.prototype.stop = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.running = false;
                        if (!this.processing) return [3, 2];
                        return [4, es6_sleep_1.promise(300)];
                    case 1:
                        _a.sent();
                        return [2, process.nextTick(this.stop.bind(this))];
                    case 2:
                        if (!this.config.onStop) return [3, 4];
                        return [4, this.config.onStop.call(this, this)];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4: return [2];
                }
            });
        });
    };
    MongoCron.prototype.tick = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            var _a, doc, lockedSleepUntil, clonedDoc, jobStart, err_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.running)
                            return [2];
                        return [4, es6_sleep_1.promise(this.config.nextDelay)];
                    case 1:
                        _b.sent();
                        if (!this.running)
                            return [2];
                        this.processing = true;
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 12, , 14]);
                        return [4, this.lockNext()];
                    case 3:
                        _a = _b.sent(), doc = _a[0], lockedSleepUntil = _a[1];
                        if (!!doc) return [3, 7];
                        this.processing = false;
                        if (!!this.idle) return [3, 5];
                        this.idle = true;
                        if (!this.config.onIdle) return [3, 5];
                        return [4, this.config.onIdle.call(this, this)];
                    case 4:
                        _b.sent();
                        _b.label = 5;
                    case 5: return [4, es6_sleep_1.promise(this.config.idleDelay)];
                    case 6:
                        _b.sent();
                        return [3, 11];
                    case 7:
                        this.idle = false;
                        if (!this.config.onDocument) return [3, 9];
                        if (!!(this.config.rescheduleIfSleepUntilIsNull
                            && dot.pick(this.config.sleepUntilFieldPath, doc) === null
                            && dot.pick(this.config.intervalFieldPath, doc))) return [3, 9];
                        clonedDoc = _.cloneDeep(doc);
                        if (!this.config.returnOriginalDocument) {
                            dot.del(this.config.sleepUntilFieldPath, clonedDoc);
                            dot.str(this.config.sleepUntilFieldPath, lockedSleepUntil, clonedDoc);
                        }
                        jobStart = moment.utc().toDate();
                        return [4, this.config.onDocument.call(this, clonedDoc, this)];
                    case 8:
                        _b.sent();
                        if (this.config.statisticsCollection) {
                            this.saveStatistics(doc, jobStart, moment.utc().toDate());
                        }
                        _b.label = 9;
                    case 9: return [4, this.reschedule(doc)];
                    case 10:
                        _b.sent();
                        this.processing = false;
                        _b.label = 11;
                    case 11: return [3, 14];
                    case 12:
                        err_1 = _b.sent();
                        return [4, this.config.onError.call(this, err_1, this)];
                    case 13:
                        _b.sent();
                        return [3, 14];
                    case 14:
                        process.nextTick(function () { return _this.tick(); });
                        return [2];
                }
            });
        });
    };
    MongoCron.prototype.lockNext = function () {
        return __awaiter(this, void 0, void 0, function () {
            var sleepUntil, currentDate, res, _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        sleepUntil = moment().add(this.config.lockDuration, 'millisecond').toDate();
                        currentDate = moment().toDate();
                        return [4, this.config.collection.findOneAndUpdate({
                                $and: [
                                    (_a = {}, _a[this.config.sleepUntilFieldPath] = { $exists: true }, _a),
                                    (_b = {}, _b[this.config.sleepUntilFieldPath] = { $not: { $gt: currentDate } }, _b),
                                    this.config.condition,
                                ].filter(function (c) { return !!c; })
                            }, {
                                $set: (_c = {}, _c[this.config.sleepUntilFieldPath] = sleepUntil, _c),
                            }, {
                                returnOriginal: true,
                            })];
                    case 1:
                        res = _d.sent();
                        return [2, [res.value, sleepUntil]];
                }
            });
        });
    };
    MongoCron.prototype.getNextStart = function (doc) {
        if (!dot.pick(this.config.intervalFieldPath, doc)) {
            return null;
        }
        var start = moment(dot.pick(this.config.sleepUntilFieldPath, doc));
        var future = moment().add(this.config.reprocessDelay, 'millisecond');
        if (start >= future) {
            return start.toDate();
        }
        try {
            var schedule = later.parse.cron(dot.pick(this.config.intervalFieldPath, doc), true);
            var dates = later.schedule(schedule).next(2, future.toDate(), dot.pick(this.config.repeatUntilFieldPath, doc));
            var next = dates[0];
            if (this.config.reprocessDelay === 0 && future.isSame(next)) {
                next = dates.length > 0 ? dates[1] : null;
            }
            return next instanceof Date ? next : null;
        }
        catch (err) {
            return null;
        }
    };
    MongoCron.prototype.reschedule = function (doc) {
        return __awaiter(this, void 0, void 0, function () {
            var nextStart, _id, res, _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        nextStart = this.getNextStart(doc);
                        _id = mongodb_1.ObjectId(doc._id);
                        if (!(!nextStart && dot.pick(this.config.autoRemoveFieldPath, doc))) return [3, 2];
                        return [4, this.config.collection.deleteOne({ _id: _id })];
                    case 1:
                        _c.sent();
                        return [3, 6];
                    case 2:
                        if (!!nextStart) return [3, 4];
                        return [4, this.config.collection.updateOne({ _id: _id }, {
                                $unset: (_a = {},
                                    _a[this.config.sleepUntilFieldPath] = 1,
                                    _a)
                            })];
                    case 3:
                        res = _c.sent();
                        return [3, 6];
                    case 4: return [4, this.config.collection.updateOne({ _id: _id }, {
                            $set: (_b = {},
                                _b[this.config.sleepUntilFieldPath] = nextStart,
                                _b)
                        })];
                    case 5:
                        _c.sent();
                        _c.label = 6;
                    case 6: return [2];
                }
            });
        });
    };
    MongoCron.prototype.saveStatistics = function (doc, jobStart, jobEnd) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.config.statisticsCollection.insert({
                    document: doc,
                    jobStart: jobStart,
                    jobEnd: jobEnd,
                    executionTime: jobEnd.getTime() - jobStart.getTime(),
                    serverName: this.serverName,
                    cronName: this.config.cronName
                });
                return [2];
            });
        });
    };
    return MongoCron;
}());
exports.MongoCron = MongoCron;
//# sourceMappingURL=cron.js.map