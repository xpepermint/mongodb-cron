"use strict";
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
var _this = this;
Object.defineProperty(exports, "__esModule", { value: true });
var ava_1 = require("ava");
var moment = require("moment");
var mongodb_1 = require("mongodb");
var es6_sleep_1 = require("es6-sleep");
var __1 = require("..");
ava_1.default.beforeEach(function (t) { return __awaiter(_this, void 0, void 0, function () {
    var _a, e_1, e_2;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = t.context;
                return [4, mongodb_1.MongoClient.connect('mongodb://localhost:27017')];
            case 1:
                _a.mongo = _b.sent();
                t.context.db = t.context.mongo.db('test');
                t.context.collection = t.context.db.collection('jobs');
                t.context.statisticsCollection = t.context.db.collection('cronStats');
                _b.label = 2;
            case 2:
                _b.trys.push([2, 4, , 5]);
                return [4, t.context.collection.drop()];
            case 3:
                _b.sent();
                return [3, 5];
            case 4:
                e_1 = _b.sent();
                return [3, 5];
            case 5:
                _b.trys.push([5, 7, , 8]);
                return [4, t.context.statisticsCollection.drop()];
            case 6:
                _b.sent();
                return [3, 8];
            case 7:
                e_2 = _b.sent();
                return [3, 8];
            case 8: return [2];
        }
    });
}); });
ava_1.default.afterEach(function (t) { return __awaiter(_this, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4, t.context.mongo.close()];
            case 1:
                _a.sent();
                return [2];
        }
    });
}); });
ava_1.default.serial('document should stop recurring at `repeatUntil`', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var _this = this;
    var stop, repeated, c;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                stop = moment().add(3000, 'millisecond');
                repeated = 0;
                c = new __1.MongoCron({
                    statisticsCollection: t.context.statisticsCollection,
                    collection: t.context.collection,
                    onDocument: function (doc) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2, repeated++];
                    }); }); },
                    reprocessDelay: 1000
                });
                return [4, c.start()];
            case 1:
                _a.sent();
                return [4, t.context.collection.insert({
                        sleepUntil: null,
                        interval: '* * * * * *',
                        repeatUntil: stop.toDate()
                    })];
            case 2:
                _a.sent();
                return [4, es6_sleep_1.promise(3000)];
            case 3:
                _a.sent();
                return [4, c.stop()];
            case 4:
                _a.sent();
                t.is(repeated, 2);
                return [2];
        }
    });
}); });
ava_1.default.serial('document with `autoRemove` should be deleted when completed', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var c, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                c = new __1.MongoCron({
                    collection: t.context.collection,
                    onDocument: function () { }
                });
                return [4, c.start()];
            case 1:
                _c.sent();
                return [4, t.context.collection.insert({
                        sleepUntil: null,
                        autoRemove: true
                    })];
            case 2:
                _c.sent();
                return [4, es6_sleep_1.promise(2000)];
            case 3:
                _c.sent();
                return [4, c.stop()];
            case 4:
                _c.sent();
                _b = (_a = t).is;
                return [4, t.context.collection.count()];
            case 5:
                _b.apply(_a, [_c.sent(), 0]);
                return [2];
        }
    });
}); });
ava_1.default.serial('documents with `rescheduleIfSleepUntilIsNull` should be rescheduled and not run immediatly', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var _this = this;
    var repeated, c, now, testMonth, testHour, testDay, pastHour;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                repeated = 0;
                c = new __1.MongoCron({
                    collection: t.context.collection,
                    onDocument: function (doc) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2, repeated++];
                    }); }); },
                    reprocessDelay: 1000,
                    rescheduleIfSleepUntilIsNull: true
                });
                now = moment.utc();
                return [4, c.start()];
            case 1:
                _a.sent();
                return [4, t.context.collection.insertMany([{
                            name: 'test-month',
                            sleepUntil: null,
                            interval: now.clone().add(1, 'month').format('s m H D M *')
                        }, {
                            name: 'test-hour',
                            sleepUntil: null,
                            interval: now.clone().add(1, 'hour').format('s m H * * *')
                        }, {
                            name: 'test-day',
                            sleepUntil: null,
                            interval: now.clone().add(1, 'day').format('s m H D * *')
                        }, {
                            name: 'past-hour',
                            sleepUntil: null,
                            interval: now.clone().subtract(1, 'hour').format('s m H * * *')
                        }])];
            case 2:
                _a.sent();
                return [4, es6_sleep_1.promise(1000)];
            case 3:
                _a.sent();
                return [4, c.stop()];
            case 4:
                _a.sent();
                now.milliseconds(0);
                return [4, t.context.collection.findOne({ name: 'test-month' })];
            case 5:
                testMonth = _a.sent();
                t.is(testMonth.sleepUntil.toISOString(), now.clone().add(1, 'month').toISOString());
                return [4, t.context.collection.findOne({ name: 'test-hour' })];
            case 6:
                testHour = _a.sent();
                t.is(testHour.sleepUntil.toISOString(), now.clone().add(1, 'hour').toISOString());
                return [4, t.context.collection.findOne({ name: 'test-day' })];
            case 7:
                testDay = _a.sent();
                t.is(testDay.sleepUntil.toISOString(), now.clone().add(1, 'day').toISOString());
                return [4, t.context.collection.findOne({ name: 'past-hour' })];
            case 8:
                pastHour = _a.sent();
                t.is(pastHour.sleepUntil.toISOString(), now.clone().subtract(1, 'hour').add(1, 'day').toISOString());
                t.is(repeated, 0);
                return [2];
        }
    });
}); });
ava_1.default.serial('reschedule to the next day', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var _this = this;
    var repeated, c, now, hr, mi, res, sleepUntil, now2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                repeated = 0;
                c = new __1.MongoCron({
                    collection: t.context.collection,
                    lockDuration: 5000,
                    onDocument: function (doc) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2, repeated++];
                    }); }); },
                    rescheduleIfSleepUntilIsNull: true
                });
                now = moment.utc();
                hr = now.hour();
                mi = now.minute();
                return [4, es6_sleep_1.promise(1000)];
            case 1:
                _a.sent();
                return [4, c.start()];
            case 2:
                _a.sent();
                return [4, t.context.collection.insert({
                        sleepUntil: null,
                        interval: "0 " + mi + " " + hr + " * * *"
                    })];
            case 3:
                _a.sent();
                return [4, es6_sleep_1.promise(1000)];
            case 4:
                _a.sent();
                return [4, c.stop()];
            case 5:
                _a.sent();
                return [4, t.context.collection.findOne({})];
            case 6:
                res = _a.sent();
                sleepUntil = moment(res.sleepUntil);
                now2 = now.clone();
                now2.seconds(0);
                now2.millisecond(0);
                now2.add(1, 'day');
                sleepUntil.millisecond(0);
                t.is(repeated, 0);
                t.is(sleepUntil.toISOString(), now2.toISOString());
                return [2];
        }
    });
}); });
ava_1.default.serial('reschedule to the next hour', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var _this = this;
    var repeated, c, now, mi, res, sleepUntil, now2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                repeated = 0;
                c = new __1.MongoCron({
                    collection: t.context.collection,
                    onDocument: function (doc) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2, repeated++];
                    }); }); },
                    rescheduleIfSleepUntilIsNull: true
                });
                now = moment.utc();
                now.seconds(0);
                now.subtract(1, 'minute');
                mi = now.minute();
                return [4, c.start()];
            case 1:
                _a.sent();
                return [4, t.context.collection.insert({
                        sleepUntil: null,
                        interval: "0 " + mi + " * * * *"
                    })];
            case 2:
                _a.sent();
                return [4, es6_sleep_1.promise(1000)];
            case 3:
                _a.sent();
                return [4, c.stop()];
            case 4:
                _a.sent();
                return [4, t.context.collection.findOne({})];
            case 5:
                res = _a.sent();
                sleepUntil = moment(res.sleepUntil);
                now2 = now.clone();
                now2.seconds(0);
                now2.millisecond(0);
                now2.add(1, 'hour');
                sleepUntil.millisecond(0);
                t.is(repeated, 0);
                t.is(sleepUntil.toISOString(), now2.toISOString());
                return [2];
        }
    });
}); });
ava_1.default.serial('start and reschedule correctly', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var _this = this;
    var repeated, c, now, res, sleepUntil, now2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                repeated = 0;
                c = new __1.MongoCron({
                    collection: t.context.collection,
                    onDocument: function (doc) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2, repeated++];
                    }); }); },
                    nextDelay: 100
                });
                now = moment.utc();
                now.add(2, 'second');
                return [4, c.start()];
            case 1:
                _a.sent();
                return [4, t.context.collection.insert({
                        sleepUntil: now.toDate(),
                        interval: now.format('s m H D M *')
                    })];
            case 2:
                _a.sent();
                return [4, es6_sleep_1.promise(3000)];
            case 3:
                _a.sent();
                return [4, c.stop()];
            case 4:
                _a.sent();
                return [4, t.context.collection.findOne({})];
            case 5:
                res = _a.sent();
                sleepUntil = moment(res.sleepUntil);
                now2 = now.clone();
                now2.millisecond(0);
                now2.add(1, 'year');
                sleepUntil.millisecond(0);
                t.is(repeated, 1);
                t.is(sleepUntil.toISOString(), now2.toISOString());
                return [2];
        }
    });
}); });
ava_1.default.serial('return document with sleepUntil in the future', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var _this = this;
    var sleepUntil, c;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sleepUntil = null;
                c = new __1.MongoCron({
                    collection: t.context.collection,
                    onDocument: function (doc) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        sleepUntil = doc.sleepUntil;
                        return [2];
                    }); }); }
                });
                return [4, c.start()];
            case 1:
                _a.sent();
                return [4, t.context.collection.insert({
                        sleepUntil: moment().subtract(1, 'hour').toDate(),
                        interval: '* * * * * *'
                    })];
            case 2:
                _a.sent();
                return [4, es6_sleep_1.promise(1000)];
            case 3:
                _a.sent();
                return [4, c.stop()];
            case 4:
                _a.sent();
                t.false(sleepUntil == null);
                t.true(moment().isBefore(sleepUntil));
                return [2];
        }
    });
}); });
ava_1.default.serial('return document with the original sleepUntil', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var _this = this;
    var sleepUntil, c;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sleepUntil = null;
                c = new __1.MongoCron({
                    collection: t.context.collection,
                    onDocument: function (doc) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        sleepUntil = doc.sleepUntil;
                        return [2];
                    }); }); },
                    returnOriginalDocument: true
                });
                return [4, c.start()];
            case 1:
                _a.sent();
                return [4, t.context.collection.insert({
                        sleepUntil: moment().subtract(1, 'hour').toDate(),
                        interval: '* * * * * *'
                    })];
            case 2:
                _a.sent();
                return [4, es6_sleep_1.promise(1000)];
            case 3:
                _a.sent();
                return [4, c.stop()];
            case 4:
                _a.sent();
                t.false(sleepUntil == null);
                t.true(moment().isAfter(sleepUntil));
                return [2];
        }
    });
}); });
ava_1.default.serial('should save statistics', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var _this = this;
    var c;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                c = new __1.MongoCron({
                    collection: t.context.collection,
                    statisticsCollection: t.context.statisticsCollection,
                    onDocument: function (doc) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4, es6_sleep_1.promise(doc.sleepMs)];
                            case 1:
                                _a.sent();
                                return [2];
                        }
                    }); }); },
                    cronName: 'my beautiful cron'
                });
                return [4, c.start()];
            case 1:
                _a.sent();
                return [4, t.context.collection.insertMany([{
                            sleepUntil: null,
                            interval: '* * * * * *',
                            sleepMs: 200
                        }, {
                            sleepUntil: null,
                            interval: moment().add(1, 'second').format('s m H * * *'),
                            sleepMs: 1000
                        }])];
            case 2:
                _a.sent();
                return [4, es6_sleep_1.promise(3000)];
            case 3:
                _a.sent();
                return [4, c.stop()];
            case 4:
                _a.sent();
                return [4, new Promise(function (resolve) {
                        t.context.statisticsCollection.find({}).toArray(function (err, arr) {
                            t.is(arr.length, 4);
                            t.is(arr[0].cronName, 'my beautiful cron');
                            t.truthy(arr[0].executionTime);
                            t.truthy(arr[0].serverName);
                            resolve();
                        });
                    })];
            case 5:
                _a.sent();
                return [2];
        }
    });
}); });
//# sourceMappingURL=cron.test.js.map