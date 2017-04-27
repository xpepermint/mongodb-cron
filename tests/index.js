import test from "ava";
import { MongoCron } from "../dist";

test("exposed content", (t) => {
  t.is(!!MongoCron, true);
});
