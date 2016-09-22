const test = require('ava');
const cron = require('../dist');

test('exposed content', (t) => {
  t.is(!!cron.MongoCron, true);
});
