import test from 'ava';
import { MongoCron } from '..';

test('exposed content', (t) => {
  t.is(!!MongoCron, true);
});
