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

var _dotObject = require('dot-object');

var _dotObject2 = _interopRequireDefault(_dotObject);

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

    this._isRunning = false;
    this._isProcessing = false;

    this._collection = options.collection;

    this._onDocument = options.onDocument;
    this._onStart = options.onStart;
    this._onStop = options.onStop;
    this._onError = options.onError;

    this._nextDelay = options.nextDelay || 0; // wait before processing next job
    this._reprocessDelay = options.reprocessDelay || 0; // wait before processing the same job again
    this._idleDelay = options.idleDelay || 0; // when there is no jobs for processing, wait before continue
    this._lockDuration = options.lockDuration || 600000; // the time of milliseconds that each job gets locked (we have to make sure that the job completes in that time frame)

    this._watchedNamespaces = options.watchedNamespaces || [];

    this._namespaceFieldPath = options.namespaceFieldPath || 'namespace';
    this._processableFieldPath = options.processableFieldPath || 'processable';
    this._lockUntilFieldPath = options.lockUntilFieldPath || 'lockUntil';
    this._waitUntilFieldPath = options.waitUntilFieldPath || 'waitUntil';
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
  * Returns the MongoDB collection.
  */

  get collection() {
    return this._collection;
  }

  /*
  * Starts the heartbit.
  */

  start() {
    var _this = this;

    return _asyncToGenerator(function* () {
      if (!_this._isRunning) {
        _this._isRunning = true;

        if (_this._onStart) {
          yield _this._onStart.call(_this, _this);
        }

        process.nextTick(_this._loop.bind(_this));
      }
    })();
  }

  /*
  * Stops the heartbit.
  */

  stop() {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      _this2._isRunning = false;

      if (_this2._isProcessing) {
        yield (0, _es6Sleep.promise)(300);
        return process.nextTick(_this2.stop.bind(_this2)); // wait until processing is complete
      }

      if (_this2._onStop) {
        yield _this2._onStop.call(_this2, _this2);
      }
    })();
  }

  /*
  * Private method which starts the heartbit loop.
  */

  _loop() {
    var _this3 = this;

    return _asyncToGenerator(function* () {
      if (!_this3._isRunning) return;

      yield (0, _es6Sleep.promise)(_this3._nextDelay);

      if (!_this3._isRunning) return;

      _this3._isProcessing = true;
      try {
        yield _this3._tick();
      } catch (e) {
        if (_this3._onError) {
          yield _this3._onError.call(_this3, e, _this3);
        } else {
          console.log(e);
        }
      }
      _this3._isProcessing = false;

      process.nextTick(_this3._loop.bind(_this3));
    })();
  }

  /*
  * Private method which handles heartbit's tick.
  */

  _tick() {
    var _this4 = this;

    return _asyncToGenerator(function* () {
      let doc = yield _this4.lockNext();

      if (!doc) {
        // no documents to process (idle state)
        return yield (0, _es6Sleep.promise)(_this4._idleDelay);
      }

      if (_this4._onDocument) {
        yield _this4._onDocument.call(_this4, doc, _this4);
      }

      yield _this4._reschedule(doc);
    })();
  }

  /*
  * Locks the next job document for processing and returns it.
  */

  lockNext() {
    var _this5 = this;

    return _asyncToGenerator(function* () {
      let lockUntil = (0, _moment2.default)().add(_this5._lockDuration, 'millisecond').toDate();
      let currentDate = (0, _moment2.default)().toDate();

      let res = yield _this5._collection.findOneAndUpdate({
        $and: [{
          $or: [{ [_this5._namespaceFieldPath]: { $in: _this5._watchedNamespaces } }, { [_this5._namespaceFieldPath]: { $exists: false } }]
        }, {
          [_this5._processableFieldPath]: true
        }, {
          $or: [{ [_this5._lockUntilFieldPath]: { $lte: currentDate } }, { [_this5._lockUntilFieldPath]: { $exists: false } }]
        }, {
          $or: [{ [_this5._waitUntilFieldPath]: { $lte: currentDate } }, { [_this5._waitUntilFieldPath]: { $exists: false } }]
        }]
      }, {
        $set: {
          [_this5._lockUntilFieldPath]: lockUntil
        }
      }, {
        sort: { [_this5._waitUntilFieldPath]: 1 },
        returnOriginal: false
      });
      return res.value;
    })();
  }

  /*
  * Returns the next date when a job document can be processed or `null` if the
  * job has expired.
  */

  _getNextStart(doc) {
    if (!_dotObject2.default.pick(this._intervalFieldPath, doc)) {
      // not recurring job
      return null;
    }

    let start = (0, _moment2.default)(_dotObject2.default.pick(this._waitUntilFieldPath, doc));
    let future = (0, _moment2.default)().add(this._reprocessDelay, 'millisecond'); // date when the next start is possible
    if (start >= future) {
      // already in future
      return start.toDate();
    }

    try {
      // new date
      let schedule = _later2.default.parse.cron(_dotObject2.default.pick(this._intervalFieldPath, doc), true);
      let dates = _later2.default.schedule(schedule).next(2, future.toDate(), _dotObject2.default.pick(this._repeatUntilFieldPath, doc));
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

  _reschedule(doc) {
    var _this6 = this;

    return _asyncToGenerator(function* () {
      let nextStart = _this6._getNextStart(doc);
      let _id = (0, _mongodb.ObjectId)(doc._id);

      if (!nextStart && _dotObject2.default.pick(_this6._autoRemoveFieldPath, doc)) {
        // remove if auto-removable and not recuring
        yield _this6._collection.deleteOne({ _id });
      } else if (!nextStart) {
        // stop execution
        yield _this6._collection.updateOne({ _id }, {
          $unset: {
            [_this6._processableFieldPath]: 1,
            [_this6._lockUntilFieldPath]: 1,
            [_this6._waitUntilFieldPath]: 1
          }
        });
      } else {
        // reschedule for reprocessing in the future (recurring)
        yield _this6._collection.updateOne({ _id }, {
          $unset: {
            [_this6._lockUntilFieldPath]: 1
          },
          $set: {
            [_this6._waitUntilFieldPath]: nextStart
          }
        });
      }
    })();
  }

}
exports.MongoCron = MongoCron;