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
    var _a, e_1;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = t.context;
                return [4, mongodb_1.MongoClient.connect('mongodb://localhost:27017')];
            case 1:
                _a.mongo = _b.sent();
                t.context.db = t.context.mongo.db('test');
                t.context.collection = t.context.db.collection('jobs');
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
            case 5: return [2];
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
ava_1.default.serial('document with `sleepUntil` should be processed', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var times, c, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                times = 0;
                c = new __1.MongoCron({
                    collection: t.context.collection,
                    onDocument: function () { return times++; },
                });
                return [4, t.context.collection.insert([
                        { sleepUntil: new Date() },
                        { sleepUntil: new Date() },
                        { sleepUntil: null },
                        { sleepUntil: new Date() },
                    ])];
            case 1:
                _c.sent();
                return [4, c.start()];
            case 2:
                _c.sent();
                return [4, es6_sleep_1.promise(3000)];
            case 3:
                _c.sent();
                return [4, c.stop()];
            case 4:
                _c.sent();
                t.is(times, 3);
                _b = (_a = t).is;
                return [4, t.context.collection.count({ sleepUntil: { $ne: null } })];
            case 5:
                _b.apply(_a, [_c.sent(), 0]);
                return [2];
        }
    });
}); });
ava_1.default.serial('cron should trigger event methods', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var _this = this;
    var onStart, onStop, onDocument, c;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                onStart = false;
                onStop = false;
                onDocument = false;
                c = new __1.MongoCron({
                    collection: t.context.collection,
                    onStart: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2, onStart = true];
                    }); }); },
                    onStop: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2, onStop = true];
                    }); }); },
                    onDocument: function (doc) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2, onDocument = true];
                    }); }); },
                });
                return [4, t.context.collection.insert({
                        sleepUntil: new Date(),
                    })];
            case 1:
                _a.sent();
                return [4, c.start()];
            case 2:
                _a.sent();
                return [4, es6_sleep_1.promise(300)];
            case 3:
                _a.sent();
                return [4, c.stop()];
            case 4:
                _a.sent();
                return [4, es6_sleep_1.promise(100)];
            case 5:
                _a.sent();
                t.is(onStart, true);
                t.is(onStop, true);
                t.is(onDocument, true);
                return [2];
        }
    });
}); });
ava_1.default.serial('cron should trigger the `onIdle` handler only once', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var count, c;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                count = 0;
                c = new __1.MongoCron({
                    collection: t.context.collection,
                    onIdle: function () { return count++; },
                });
                return [4, c.start()];
            case 1:
                _a.sent();
                return [4, es6_sleep_1.promise(1000)];
            case 2:
                _a.sent();
                return [4, c.stop()];
            case 3:
                _a.sent();
                t.is(count, 1);
                return [2];
        }
    });
}); });
ava_1.default.serial('locked documents should not be available for locking', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var processed, future, c;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                processed = false;
                future = moment().add(5000, 'millisecond');
                c = new __1.MongoCron({
                    collection: t.context.collection,
                    lockDuration: 5000,
                    onDocument: function () { return processed = true; },
                });
                return [4, t.context.collection.insert({
                        sleepUntil: future.toDate(),
                    })];
            case 1:
                _a.sent();
                return [4, c.start()];
            case 2:
                _a.sent();
                return [4, es6_sleep_1.promise(500)];
            case 3:
                _a.sent();
                return [4, c.stop()];
            case 4:
                _a.sent();
                t.is(processed, false);
                return [2];
        }
    });
}); });
ava_1.default.serial('condition should filter lockable documents', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var count, c;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                count = 0;
                c = new __1.MongoCron({
                    collection: t.context.collection,
                    condition: { handle: true },
                    onDocument: function () { return count++; },
                });
                return [4, t.context.collection.insert({
                        handle: true,
                        sleepUntil: new Date(),
                    })];
            case 1:
                _a.sent();
                return [4, t.context.collection.insert({
                        sleepUntil: new Date(),
                    })];
            case 2:
                _a.sent();
                return [4, c.start()];
            case 3:
                _a.sent();
                return [4, es6_sleep_1.promise(4000)];
            case 4:
                _a.sent();
                return [4, c.stop()];
            case 5:
                _a.sent();
                t.is(count, 1);
                return [2];
        }
    });
}); });
ava_1.default.serial('document processing should not start before `sleepUntil`', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var _this = this;
    var ranInFuture, future, c;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                ranInFuture = false;
                future = moment().add(3000, 'millisecond');
                c = new __1.MongoCron({
                    collection: t.context.collection,
                    onDocument: function (doc) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2, ranInFuture = moment() >= future];
                    }); }); },
                });
                return [4, c.start()];
            case 1:
                _a.sent();
                return [4, t.context.collection.insert({
                        sleepUntil: future.toDate(),
                    })];
            case 2:
                _a.sent();
                return [4, es6_sleep_1.promise(4000)];
            case 3:
                _a.sent();
                return [4, c.stop()];
            case 4:
                _a.sent();
                t.is(ranInFuture, true);
                return [2];
        }
    });
}); });
ava_1.default.serial('document with `interval` should run repeatedly', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var _this = this;
    var repeated, c;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                repeated = 0;
                c = new __1.MongoCron({
                    collection: t.context.collection,
                    onDocument: function (doc) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2, repeated++];
                    }); }); }
                });
                return [4, c.start()];
            case 1:
                _a.sent();
                return [4, t.context.collection.insert({
                        sleepUntil: new Date(),
                        interval: '* * * * * *',
                    })];
            case 2:
                _a.sent();
                return [4, es6_sleep_1.promise(3000)];
            case 3:
                _a.sent();
                return [4, c.stop()];
            case 4:
                _a.sent();
                t.is(repeated >= 3, true);
                return [2];
        }
    });
}); });
ava_1.default.serial('document should stop recurring at `repeatUntil`', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var _this = this;
    var repeated, stop, c;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                repeated = 0;
                stop = moment().add(3000, 'millisecond');
                c = new __1.MongoCron({
                    collection: t.context.collection,
                    onDocument: function (doc) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2, repeated++];
                    }); }); },
                    reprocessDelay: 1000,
                });
                return [4, c.start()];
            case 1:
                _a.sent();
                return [4, t.context.collection.insert({
                        sleepUntil: new Date(),
                        interval: '* * * * * *',
                        repeatUntil: stop.toDate(),
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
                    collection: t.context.collection
                });
                return [4, c.start()];
            case 1:
                _c.sent();
                return [4, t.context.collection.insert({
                        sleepUntil: new Date(),
                        autoRemove: true,
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
//# sourceMappingURL=cron.test.js.map