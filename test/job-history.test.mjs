import test from "node:test";
import assert from "node:assert/strict";
import { freshnessFor, reconcileJobHistory } from "../scripts/lib/job-history.mjs";

const now = new Date("2026-07-10T01:00:00.000Z");

test("marks newly discovered jobs for seven-day highlighting", () => {
  const [job] = reconcileJobHistory({
    currentJobs: [{ id: "new", title: "New postdoc", status: "active" }],
    now
  });

  assert.equal(job.changeType, "new");
  assert.equal(job.lifecycleStatus, "active");
  assert.equal(freshnessFor(job, now).labelZh, "本周新增");
});

test("marks changed jobs as weekly updates", () => {
  const [job] = reconcileJobHistory({
    previousJobs: [{
      id: "changed",
      title: "Postdoc",
      deadline: "2026-08-01",
      firstSeenAt: "2026-07-01T00:00:00.000Z",
      lastChangedAt: "2026-07-01T00:00:00.000Z"
    }],
    currentJobs: [{ id: "changed", title: "Postdoc", deadline: "2026-08-15", status: "active" }],
    now
  });

  assert.equal(job.changeType, "updated");
  assert.equal(freshnessFor(job, now).labelZh, "本周更新");
});

test("archives missing jobs only after their source was checked", () => {
  const previous = [{
    id: "gone",
    title: "Old postdoc",
    sourceId: "source-a",
    fetchedAt: "2026-07-01T00:00:00.000Z",
    lifecycleStatus: "active"
  }];
  const [job] = reconcileJobHistory({
    currentJobs: [],
    previousJobs: previous,
    sources: [{ id: "source-a", status: "ok" }],
    now
  });

  assert.equal(job.lifecycleStatus, "expired");
  assert.equal(job.changeType, "expired");
  assert.ok(job.archivedAt);
});

test("keeps missing jobs active when the source failed", () => {
  const [job] = reconcileJobHistory({
    currentJobs: [],
    previousJobs: [{
      id: "unknown",
      title: "Unverified postdoc",
      sourceId: "source-a",
      fetchedAt: "2026-07-01T00:00:00.000Z",
      lifecycleStatus: "active"
    }],
    sources: [{ id: "source-a", status: "error" }],
    now
  });

  assert.equal(job.lifecycleStatus, "active");
  assert.equal(job.stale, true);
});
