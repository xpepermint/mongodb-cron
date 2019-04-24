import { Spec } from '@hayspec/spec';
import * as all from '..';

const spec = new Spec();

spec.test('exposes objects', (ctx) => {
  ctx.true(!!all.MongoCron);
});

export default spec;
