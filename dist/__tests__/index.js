'use strict';

var _ava = require('ava');

var _ava2 = _interopRequireDefault(_ava);

var _mongodb = require('mongodb');

var _ = require('..');

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { return step("next", value); }, function (err) { return step("throw", err); }); } } return step("next"); }); }; }

_ava2.default.beforeEach((() => {
  var _ref = _asyncToGenerator(function* (t) {
    t.context.db = yield _mongodb.MongoClient.connect('mongodb://localhost:27017/mongodb-cron-test');
    t.context.collection = t.context.db.collection('events');
    try {
      yield t.context.collection.drop();
    } catch (e) {} // required
  });

  return function (_x) {
    return _ref.apply(this, arguments);
  };
})());

_ava2.default.afterEach((() => {
  var _ref2 = _asyncToGenerator(function* (t) {
    yield t.context.collection.drop();
    yield t.context.db.close();
  });

  return function (_x2) {
    return _ref2.apply(this, arguments);
  };
})());

_ava2.default.serial.cb('document with `enabled=true` should trigger the `onDocument` handler', t => {
  let collection = t.context.collection;

  let cron = new _.MongoCron({
    collection,
    onDocument: (() => {
      var _ref3 = _asyncToGenerator(function* (doc, cron) {
        t.pass();
        t.end();
        yield cron.stop({ force: true });
      });

      return function onDocument(_x3, _x4) {
        return _ref3.apply(this, arguments);
      };
    })()
  });
  cron.start();
  collection.insert({
    enabled: true
  });
});

_ava2.default.serial.cb('document with `waitUntil` should delay execution', t => {
  let collection = t.context.collection;

  let time = (0, _moment2.default)().add(3000, 'millisecond');
  let cron = new _.MongoCron({
    collection,
    onDocument: (() => {
      var _ref4 = _asyncToGenerator(function* (doc, cron) {
        if ((0, _moment2.default)() >= time) {
          t.pass();
        } else {
          t.fail();
        }
        t.end();
        yield cron.stop({ force: true });
      });

      return function onDocument(_x5, _x6) {
        return _ref4.apply(this, arguments);
      };
    })()
  });
  cron.start();
  collection.insert({
    enabled: true,
    waitUntil: time.toDate()
  });
});

_ava2.default.serial.cb('document with `interval` should become a recurring job', t => {
  let collection = t.context.collection;

  let repeated = 0;
  let cron = new _.MongoCron({
    collection,
    onDocument: (() => {
      var _ref5 = _asyncToGenerator(function* (doc, cron) {
        return repeated++;
      });

      return function onDocument(_x7, _x8) {
        return _ref5.apply(this, arguments);
      };
    })()
  });
  cron.start();
  collection.insert({
    enabled: true,
    interval: '* * * * * *'
  });
  setTimeout(() => {
    if (repeated >= 2) {
      t.pass();
    } else {
      t.fail();
    }
    t.end();
    cron.stop();
  }, 3000);
});

_ava2.default.serial.cb('document should stop recurring at `expireAt`', t => {
  let collection = t.context.collection;

  let stop = (0, _moment2.default)().add(3000, 'millisecond');
  let repeated = 0;
  let cron = new _.MongoCron({
    collection,
    onDocument: (() => {
      var _ref6 = _asyncToGenerator(function* (doc, cron) {
        return repeated++;
      });

      return function onDocument(_x9, _x10) {
        return _ref6.apply(this, arguments);
      };
    })(),
    reprocessDelay: 1000
  });
  cron.start();
  collection.insert({
    enabled: true,
    interval: '* * * * * *',
    expireAt: stop.toDate()
  });
  setTimeout(() => {
    if (repeated === 2) {
      t.pass();
    } else {
      t.fail();
    }
    t.end();
    cron.stop();
  }, 3000);
});

_ava2.default.serial.cb('document with `deleteExpired` should be deleted when expired', t => {
  let collection = t.context.collection;

  let stop = (0, _moment2.default)().add(3000, 'millisecond');
  let repeated = 0;
  let cron = new _.MongoCron({
    collection
  });
  cron.start();
  collection.insert({
    enabled: true,
    deleteExpired: true
  });
  setTimeout(() => {
    cron.stop();
    collection.count().then(n => {
      if (n === 0) {
        t.pass();
      } else {
        t.fail();
      }
      t.end();
    });
  }, 2000);
});

_ava2.default.serial.cb('document with `sid=1` should be processed only by the `sid=1` server', t => {
  let collection = t.context.collection;

  let cron0 = new _.MongoCron({
    collection
  });
  let cron1 = new _.MongoCron({
    collection,
    sid: '1'
  });
  cron0.start();
  cron1.start();
  collection.insert([{ enabled: true, sid: '1' }, { enabled: true }, { enabled: true, sid: '1' }, { enabled: true }, { enabled: true, sid: '1' }]);
  setTimeout(() => {
    cron0.stop();
    cron1.stop();
    collection.count({ sid: '1' }).then(n => {
      if (n >= 3 && n <= 5) {
        t.pass();
      } else {
        t.fail();
      }
      t.end();
    });
  }, 2000);
});

_ava2.default.serial.cb('locked documents should stay untouched by other processes', t => {
  let collection = t.context.collection;

  let cron = new _.MongoCron({
    collection
  });
  cron.start();
  collection.insert({
    enabled: true,
    locked: true,
    startedAt: new Date()
  });
  setTimeout(function () {
    collection.count({ finishedAt: { $exists: true } }).then(n => {
      if (n === 0) {
        t.pass();
      } else {
        t.fail();
      }
      t.end();
      cron.stop({ force: true });
    });
  }, 2000);
});

_ava2.default.serial.cb('locked documents should restart after `lockTimeout` milliseconds', t => {
  let collection = t.context.collection;

  let cron = new _.MongoCron({
    collection,
    lockTimeout: 10
  });
  cron.start();
  collection.insert({
    enabled: true,
    locked: true,
    startedAt: new Date()
  });
  setTimeout(function () {
    collection.count({ finishedAt: { $exists: true } }).then(n => {
      if (n === 1) {
        t.pass();
      } else {
        t.fail();
      }
      t.end();
      cron.stop({ force: true });
    });
  }, 2000);
});