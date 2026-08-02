import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const research = JSON.parse(await fs.readFile(path.join(projectRoot, "data", "research", "funding-intelligence.json"), "utf8"));
const app = await fs.readFile(path.join(projectRoot, "src", "site", "app.js"), "utf8");

test("funding research has broad, auditable coverage", () => {
  assert.ok(research.opportunities.length >= 40);
  assert.ok(research.coverage.length >= 50);
  assert.ok(research.seedCases.some((item) => item.id === "wenqi-zhu-oxford"));

  const regions = new Set(research.coverage.map((item) => item.region));
  for (const region of ["Hong Kong", "Europe", "United Kingdom", "United States", "Australia", "Japan", "Singapore", "Global"]) {
    assert.ok(regions.has(region), `missing coverage region: ${region}`);
  }
});

test("funding opportunities use unique ids and official evidence", () => {
  const ids = new Set();
  for (const item of research.opportunities) {
    for (const key of ["id", "name", "nameZh", "provider", "category", "status", "statusZh", "strategicTier", "baseScore", "eligibilitySummaryZh", "fundingSummaryZh", "timingSummaryZh", "nextActionZh", "sourceUrl", "sourceType", "evidenceGrade", "lastVerifiedAt"]) {
      assert.notEqual(item[key], undefined, `${item.id ?? item.name} missing ${key}`);
      assert.notEqual(item[key], "", `${item.id ?? item.name} has empty ${key}`);
    }
    assert.match(item.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(item.id), `duplicate opportunity id: ${item.id}`);
    ids.add(item.id);
    assert.ok(["A", "B", "C"].includes(item.strategicTier));
    assert.ok(Number(item.baseScore) >= 0 && Number(item.baseScore) <= 100);
    assert.ok(Array.isArray(item.stages) && item.stages.length > 0);
    assert.ok(Array.isArray(item.regions) && item.regions.length > 0);
    assert.equal(new URL(item.sourceUrl).protocol, "https:");
    if (item.deadline) {
      assert.match(item.deadline, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(!Number.isNaN(Date.parse(`${item.deadline}T23:59:59Z`)));
      assert.ok(item.deadlineContextZh, `${item.id} deadline needs context`);
    }
  }
});

test("coverage ledger keeps unresolved sources out of verified status", () => {
  const ids = new Set();
  for (const item of research.coverage) {
    assert.ok(item.id && item.name && item.region && item.scope && item.status && item.checkedAt && item.url && item.resultSummaryZh);
    assert.ok(!ids.has(item.id), `duplicate coverage id: ${item.id}`);
    ids.add(item.id);
    assert.equal(new URL(item.url).protocol, "https:");
    if (/等待|受限|旧轮次|逐项|目录/.test(item.resultSummaryZh)) {
      assert.notEqual(item.status, "checked", `${item.id} should remain a watch or limited source`);
    }
  }
});

test("funding workspace is browser-only and encrypted backups are explicit", () => {
  for (const token of [
    "faculty-radar:funding-workspace:v1",
    "localStorage.setItem",
    "AES-GCM",
    "PBKDF2",
    "crypto.subtle.encrypt",
    "crypto.subtle.decrypt",
    "funding-deadlines.ics"
  ]) {
    assert.ok(app.includes(token), `missing local workspace contract: ${token}`);
  }
  assert.ok(!app.includes("sendFundingEmail"));
  assert.ok(!app.includes("autoSubmitFunding"));
});
