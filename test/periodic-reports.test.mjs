import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("monthly quarterly and annual reports are generated and scheduled", () => {
  const pkg = JSON.parse(read("package.json"));
  const workflow = read(".github/workflows/radar.yml");
  const generator = read("scripts/generate-periodic-report.mjs");

  for (const kind of ["monthly", "quarterly", "annual"]) {
    assert.ok(pkg.scripts[`report:${kind}`]);
    assert.ok(pkg.scripts[`notify:${kind}`]);
    const report = read(`data/generated/${kind}-report.md`);
    assert.match(report, /## 核心变化/);
    assert.match(report, /## 学术人物群体/);
    assert.match(report, /## 产业观察/);
    assert.match(report, /## 数据源健康/);
  }
  assert.match(workflow, /MONTHLY_REPORT/);
  assert.match(workflow, /QUARTERLY_REPORT/);
  assert.match(workflow, /ANNUAL_REPORT/);
  assert.match(generator, /intelligence-snapshots\.json/);
  assert.match(generator, /findBaseline/);
});
