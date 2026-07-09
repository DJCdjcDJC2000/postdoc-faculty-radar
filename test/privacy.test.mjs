import test from "node:test";
import assert from "node:assert/strict";
import { assertNoPrivateFields, stripPrivateFields } from "../scripts/lib/privacy.mjs";

test("strips private fields recursively from public output", () => {
  const value = {
    id: "job-1",
    title: "Postdoc",
    private: {
      myStage: "收藏"
    },
    nested: {
      myPriority: "P0",
      publicValue: true,
      items: [
        {
          privateNotes: "do not leak",
          visible: "ok"
        }
      ]
    }
  };

  const stripped = stripPrivateFields(value);
  assert.equal(stripped.private, undefined);
  assert.equal(stripped.nested.myPriority, undefined);
  assert.equal(stripped.nested.items[0].privateNotes, undefined);
  assert.equal(stripped.nested.items[0].visible, "ok");
  assert.doesNotThrow(() => assertNoPrivateFields(stripped));
});

test("detects private field leaks in public structures", () => {
  assert.throws(
    () => assertNoPrivateFields({ profile: { privateSummaryZh: "hidden" } }),
    /Private field leaked/
  );
});
