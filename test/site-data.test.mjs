import test from "node:test";
import assert from "node:assert/strict";
import { buildAlerts, enrichJobForSite } from "../scripts/lib/site-data.mjs";

test("enriches job with Chinese role and trust labels", () => {
  const job = enrichJobForSite({
    id: "j1",
    title: "Postdoctoral Fellow",
    institution: "Example University",
    region: "Hong Kong",
    roleType: "postdoc",
    trust: "official",
    priority: "A",
    matchScore: 92,
    matchedKeywords: ["optimization"]
  });

  assert.equal(job.roleLabelZh, "博后");
  assert.equal(job.sourceTrustLabelZh, "官方源");
  assert.match(job.simpleReason, /Hong Kong/);
});

test("builds alerts only from A/B opportunities", () => {
  const alerts = buildAlerts([
    { id: "a", priority: "A", matchScore: 90, title: "A", roleType: "postdoc" },
    { id: "seed", priority: "A", matchScore: 100, title: "Watch seed", roleType: "postdoc", recordType: "watch_seed" },
    { id: "c", priority: "C", matchScore: 50, title: "C", roleType: "faculty" }
  ]);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].id, "a");
});
