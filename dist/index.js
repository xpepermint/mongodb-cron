'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MongoCron = undefined;

var _mongodb = require('mongodb');

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

var _later = require('later');

var _later2 = _interopRequireDefault(_later);

var _es6Sleep = require('es6-sleep');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { return step("next", value); }, function (err) { return step("throw", err); }); } } return step("next"); }); }; }

/*
* Main class for converting a collection into cron.
*/

class MongoCron {

  /*
  * Class constructor.
  */

  constructor() {
    let options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    this._collection = options.collection;
    this._sid = options.sid;

    this._onDocument = options.onDocument;
    this._onStart = options.onStart;
    this._onStop = options.onStop;
    this._onError = options.onError;

    this._nextDelay = options.nextDelay || 0; // wait before processing next job
    this._reprocessDelay = options.reprocessDelay || 0; // wait before processing the same job again
    this._idleDelay = options.idleDelay || 0; // when there is no jobs for processing, wait before continue

    this._lockTimeout = options.lockTimeout || 0; // the time after a locked job is restarted (0 for disable)

    this._sidFieldPath = options.sidFieldPath || 'sid';
    this._enabledFieldPath = options.enabledFieldPath || 'enabled';
    this._waitUntilFieldPath = options.waitUntilFieldPath || 'waitUntil';
    this._expireAtFieldPath = options.expireAtFieldPath || 'expireAt';
    this._intervalFieldPath = options.intervalFieldPath || 'interval';
    this._deleteExpiredFieldPath = options.deleteExpiredFieldPath || 'deleteExpired';
    this._lockedFieldPath = options.lockedFieldPath || 'locked';
    this._startedAtFieldPath = options.startedAtFieldPath || 'startedAt';
    this._finishedAtFieldPath = options.finishedAtFieldPath || 'finishedAt';

    this._running = false;
    this._processing = false;
  }

  /*
  * Returns true if the cron is running.
  */

  get running() {
    return this._running;
  }

  /*
  * Returns true if the cron is processing a document.
  */

  get processing() {
    return this._processing;
  }

  /*
  * Starts the heartbit.
  */

  start() {
    var _this = this;

    return _asyncToGenerator(function* () {
      if (!_this.running) {
        _this._running = true;

        if (_this._onStart) {
          yield _this._onStart(_this);
        }

        process.nextTick(_this._loop.bind(_this));
      }
      return _this;
    })();
  }

  /*
  * Starts the heartbit.
  */

  stop() {
    var _this2 = this,
        _arguments = arguments;

    return _asyncToGenerator(function* () {
      var _ref = _arguments.length <= 0 || _arguments[0] === undefined ? {} : _arguments[0];

      var _ref$force = _ref.force;
      let force = _ref$force === undefined ? false : _ref$force;

      _this2._running = false;

      if (force) {
        _this2._processing = false;
      }

      do {
        if (!_this2._processing) {
          break;
        } else {
          yield (0, _es6Sleep.promise)(300);
        }
      } while (true);

      if (_this2._onStop) {
        yield _this2._onStop(_this2);
      }

      return _this2;
    })();
  }

  /*
  * Private method which starts the heartbit loop.
  */

  _loop() {
    var _this3 = this;

    return _asyncToGenerator(function* () {
      do {
        if (!_this3._running) break;

        _this3._processing = true;
        try {
          yield _this3._tick();
        } catch (e) {
          if (_this3._onError) {
            yield _this3._onError(e, _this3);
          } else {
            console.log(e);
          }
        }
        _this3._processing = false;

        yield (0, _es6Sleep.promise)(_this3._nextDelay);
      } while (true);
    })();
  }

  /*
  * Private method which handles heartbit's tick.
  */

  _tick() {
    var _this4 = this;

    return _asyncToGenerator(function* () {
      let doc = yield _this4.lockNextDocument();

      if (!doc) {
        // no documents to process (idle state)
        return yield (0, _es6Sleep.promise)(_this4._idleDelay);
      }

      if (_this4._onDocument) {
        yield _this4._onDocument(doc, _this4);
      }
      yield _this4.rescheduleDocument(doc);
    })();
  }

  /*
  * A private method which prepares the next document for processing
  * and returns its updated version.
  */

  lockNextDocument() {
    var _this5 = this;

    return _asyncToGenerator(function* () {
      let currentTime = new Date();
      let lockTimeout = _this5._lockTimeout > 0 ? (0, _moment2.default)().add(_this5._lockTimeout, 'millisecond').toDate() : null;

      let res = yield _this5._collection.findOneAndUpdate({
        $and: [{
          $or: [{ [_this5._sidFieldPath]: _this5._sid }, { [_this5._sidFieldPath]: { $exists: false } }]
        }, {
          [_this5._enabledFieldPath]: true
        }, {
          $or: [{ [_this5._waitUntilFieldPath]: { $lte: currentTime } }, { [_this5._waitUntilFieldPath]: { $exists: false } }]
        }, {
          $or: [{ [_this5._expireAtFieldPath]: { $gte: currentTime } }, { [_this5._expireAtFieldPath]: { $exists: false } }]
        }, {
          $or: [{ [_this5._lockedFieldPath]: { $exists: false } }, lockTimeout ? { [_this5._startedAtFieldPath]: { $lte: lockTimeout } } : null].filter(function (c) {
            return !!c;
          })
        }]
      }, {
        $set: Object.assign({
          [_this5._lockedFieldPath]: true,
          [_this5._startedAtFieldPath]: currentTime
        }, _this5._sid ? { [_this5._sidFieldPath]: _this5._sid } : {}),
        $unset: {
          [_this5._finishedAtFieldPath]: 1
        }
      }, {
        sort: { [_this5._waitUntilFieldPath]: 1 },
        returnOriginal: false
      });
      return res.value;
    })();
  }

  /*
  * Returns the next date when the job should be processed or `null` if the job
  * is expired or not recurring.
  */

  getNextStart(doc) {
    if (!doc[this._intervalFieldPath]) {
      // not recurring job
      return null;
    }

    let start = (0, _moment2.default)(doc[this._waitUntilFieldPath]);
    let future = (0, _moment2.default)().add(this._reprocessDelay, 'millisecond'); // date when the next start is possible
    if (start >= future) {
      // already in future
      return start.toDate();
    }

    try {
      // new date
      let schedule = _later2.default.parse.cron(doc[this._intervalFieldPath], true);
      let dates = _later2.default.schedule(schedule).next(2, future.toDate(), doc[this._expireAtFieldPath]);
      let next = dates[1];
      return next instanceof Date ? next : null;
    } catch (err) {
      return null;
    }
  }

  /*
  * Private method which tries to reschedule a document, marks it as expired or
  * deletes a job if `deleteExpired` is set to `true`.
  */

  rescheduleDocument(doc) {
    var _this6 = this;

    return _asyncToGenerator(function* () {
      let nextStart = _this6.getNextStart(doc);
      let _id = (0, _mongodb.ObjectId)(doc._id);

      if (!nextStart && doc[_this6._deleteExpiredFieldPath]) {
        yield _this6._collection.deleteOne({ _id });
      } else if (!nextStart) {
        yield _this6._collection.updateOne({ _id }, {
          $unset: {
            [_this6._lockedFieldPath]: 1,
            [_this6._waitUntilFieldPath]: 1
          },
          $set: {
            [_this6._finishedAtFieldPath]: new Date(),
            [_this6._enabledFieldPath]: false
          }
        });
      } else {
        yield _this6._collection.updateOne({ _id }, {
          $unset: {
            [_this6._lockedFieldPath]: 1
          },
          $set: {
            [_this6._finishedAtFieldPath]: new Date(),
            [_this6._waitUntilFieldPath]: nextStart
          }
        });
      }
    })();
  }

}
exports.MongoCron = MongoCron;