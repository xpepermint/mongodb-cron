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
    this._isIdle = false;

    this._collection = options.collection;
    this._redis = options.redis;

    this._onDocument = options.onDocument;
    this._onStart = options.onStart;
    this._onStop = options.onStop;
    this._onError = options.onError || console.error;

    this._nextDelay = options.nextDelay || 0; // wait before processing next job
    this._reprocessDelay = options.reprocessDelay || 0; // wait before processing the same job again
    this._idleDelay = options.idleDelay || 0; // when there is no jobs for processing, wait before continue
    this._lockDuration = options.lockDuration || 600000; // the time of milliseconds that each job gets locked (we have to make sure that the job completes in that time frame)
    this._watchedNamespaces = options.watchedNamespaces;
    this._namespaceDedication = options.namespaceDedication || false;

    this._namespaceFieldPath = options.namespaceFieldPath || 'namespace';
    this._sleepUntilFieldPath = options.sleepUntilFieldPath || 'sleepUntil';
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
  * Returns true if the cron is in idle state.
  */

  get isIdle() {
    return this._isIdle;
  }

  /*
  * Returns the MongoDB collection.
  */

  get collection() {
    return this._collection;
  }

  /*
  * Returns the Redis instance.
  */

  get redis() {
    return this._redis;
  }

  /*
  * Creates required collection indexes.
  */

  setup() {
    var _this = this;

    return _asyncToGenerator(function* () {
      yield _this._collection.createIndex({
        [_this._sleepUntilFieldPath]: 1
      }, { sparse: true });

      yield _this._collection.createIndex({
        [_this._namespaceFieldPath]: 1,
        [_this._sleepUntilFieldPath]: 1
      }, { sparse: true });
    })();
  }

  /*
  * Starts the heartbit.
  */

  start() {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      if (!_this2._isRunning) {
        _this2._isRunning = true;

        if (_this2._onStart) {
          yield _this2._onStart.call(_this2, _this2);
        }

        process.nextTick(_this2._tick.bind(_this2));
      }
    })();
  }

  /*
  * Stops the heartbit.
  */

  stop() {
    var _this3 = this;

    return _asyncToGenerator(function* () {
      _this3._isRunning = false;

      if (_this3._isProcessing || _this3._isIdle) {
        yield (0, _es6Sleep.promise)(300);
        return process.nextTick(_this3.stop.bind(_this3)); // wait until processing is complete
      }

      if (_this3._onStop) {
        yield _this3._onStop.call(_this3, _this3);
      }
    })();
  }

  /*
  * Private method which runs the heartbit tick.
  */

  _tick(namespace) {
    var _this4 = this;

    return _asyncToGenerator(function* () {
      if (!_this4._isRunning) return;
      yield (0, _es6Sleep.promise)(_this4._nextDelay);
      if (!_this4._isRunning) return;

      _this4._isProcessing = true;
      try {
        if (_this4._namespaceDedication && typeof namespace === 'undefined') {
          // managing namespace
          namespace = yield _this4._lockNamespace();
        }

        let doc = yield _this4._lockJob(namespace); // locking next job
        if (!doc) {
          if (namespace) {
            // processing for this namespace ended
            yield _this4._unlockNamespace(namespace);
          } else if (namespace === null) {
            // all namespaces (including the null) have been processed
            _this4._isIdle = true;
            yield (0, _es6Sleep.promise)(_this4._idleDelay);
            _this4._isIdle = false;
          }
          namespace = undefined; // no documents left, find new namespace
        } else {
          if (_this4._onDocument) {
            yield _this4._onDocument.call(_this4, doc, _this4);
          }
          yield _this4._reschedule(doc);
        }
      } catch (e) {
        yield _this4._onError.call(_this4, e, _this4);
      }
      _this4._isProcessing = false;

      // run next heartbit tick
      process.nextTick(function () {
        return _this4._tick(namespace);
      });
    })();
  }

  /*
  * Locks the next namespace for processing and returns it.
  */

  _lockNamespace() {
    var _this5 = this;

    return _asyncToGenerator(function* () {
      let currentDate = (0, _moment2.default)().toDate();

      let filters = [];
      if (_this5._watchedNamespaces) {
        filters.push({ [_this5._namespaceFieldPath]: { $exists: true } }, { [_this5._namespaceFieldPath]: { $in: _this5._watchedNamespaces } });
      }
      filters.push({ [_this5._sleepUntilFieldPath]: { $exists: true } });

      let cursor = yield _this5._collection.aggregate([{
        $match: {
          $and: filters
        }
      }, {
        $group: {
          _id: `$${ _this5._namespaceFieldPath }`,
          maxLockUntil: { $max: `$${ _this5._sleepUntilFieldPath }` }
        }
      }, {
        $match: {
          maxLockUntil: { $not: { $gt: currentDate } }
        }
      }]).batchSize(1);

      let namespace = null;
      do {
        let doc = yield cursor.nextObject();
        if (!doc) {
          break;
        }
        let res = yield _this5._redis.set(doc._id, '0', 'PX', _this5._lockDuration, 'NX');
        if (res === 'OK') {
          namespace = doc._id;
          break;
        }
      } while (true);

      yield cursor.close();

      return namespace;
    })();
  }

  /*
  * Unlocks the namespace.
  */

  _unlockNamespace(namespace) {
    var _this6 = this;

    return _asyncToGenerator(function* () {
      if (namespace) {
        yield _this6._redis.del(namespace);
      }
    })();
  }

  /*
  * Locks the next job document for processing and returns it.
  */

  _lockJob(namespace) {
    var _this7 = this;

    return _asyncToGenerator(function* () {
      let sleepUntil = (0, _moment2.default)().add(_this7._lockDuration, 'millisecond').toDate();
      let currentDate = (0, _moment2.default)().toDate();

      let filters = [];
      if (typeof namespace !== 'undefined') {
        filters.push({ [_this7._namespaceFieldPath]: { $exists: true } }, { [_this7._namespaceFieldPath]: namespace });
      } else if (_this7._watchedNamespaces) {
        filters.push({ [_this7._namespaceFieldPath]: { $exists: true } }, { [_this7._namespaceFieldPath]: { $in: _this7._watchedNamespaces } });
      }
      filters.push({ [_this7._sleepUntilFieldPath]: { $exists: true } }, { [_this7._sleepUntilFieldPath]: { $not: { $gt: currentDate } } });

      let res = yield _this7._collection.findOneAndUpdate({
        $and: filters
      }, {
        $set: {
          [_this7._sleepUntilFieldPath]: sleepUntil
        }
      }, {
        sort: { [_this7._sleepUntilFieldPath]: 1 },
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

    let start = (0, _moment2.default)(_dotObject2.default.pick(this._sleepUntilFieldPath, doc)).subtract(this._lockDuration, 'millisecond'); // get processing start date (before lock duration was added)
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
    var _this8 = this;

    return _asyncToGenerator(function* () {
      let nextStart = _this8._getNextStart(doc);
      let _id = (0, _mongodb.ObjectId)(doc._id);

      if (!nextStart && _dotObject2.default.pick(_this8._autoRemoveFieldPath, doc)) {
        // remove if auto-removable and not recuring
        yield _this8._collection.deleteOne({ _id });
      } else if (!nextStart) {
        // stop execution
        let res = yield _this8._collection.updateOne({ _id }, {
          $unset: {
            [_this8._sleepUntilFieldPath]: 1
          }
        });
      } else {
        // reschedule for reprocessing in the future (recurring)
        yield _this8._collection.updateOne({ _id }, {
          $set: {
            [_this8._sleepUntilFieldPath]: nextStart
          }
        });
      }
    })();
  }

}
exports.MongoCron = MongoCron;