import test from "node:test";
import assert from "node:assert/strict";
import keywords from "../config/keywords.json" with { type: "json" };
import { dedupeJobs } from "../scripts/lib/normalize.mjs";
import { inferRoleType, scoreJob } from "../scripts/lib/score.mjs";

test("scores a Europe optimization postdoc as high priority", () => {
  const result = scoreJob({
    title: "Postdoctoral Researcher in Stochastic Complementarity and Numerical Analysis",
    institution: "Example University",
    region: "Europe",
    roleType: "postdoc",
    trust: "official",
    description: "Scientific computing, variational inequalities, sample average approximation."
  }, keywords, new Date("2026-07-09T00:00:00Z"));

  assert.equal(result.priority, "A");
  assert.ok(result.matchScore >= 80);
  assert.ok(result.matchedKeywords.includes("stochastic complementarity"));
});

test("infers research fellow role from title", () => {
  assert.equal(
    inferRoleType("Research Fellow in mathematical optimization", ["postdoc"], keywords),
    "research_fellow"
  );
});

test("deduplicates jobs by normalized URL", () => {
  const jobs = dedupeJobs([
    {
      title: "Postdoc A",
      institution: "Example",
      region: "Europe",
      sourceUrl: "https://example.edu/job?id=1&utm_source=x",
      matchScore: 55
    },
    {
      title: "Postdoc A Updated",
      institution: "Example",
      region: "Europe",
      sourceUrl: "https://example.edu/job?id=1",
      matchScore: 88
    }
  ]);

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, "Postdoc A Updated");
});

test("does not match short acronyms inside ordinary words", () => {
  const result = scoreJob({
    title: "Assistant Director (Mainland Philanthropy)",
    institution: "Example University",
    region: "Hong Kong",
    roleType: "postdoc",
    trust: "official",
    deadline: "2026-07-31",
    description: "Development and Alumni Affairs Office."
  }, keywords, new Date("2026-07-09T00:00:00Z"));

  assert.equal(result.matchedKeywords.includes("AI"), false);
  assert.equal(result.priority, "D");
});

test("demotes medical AI postdoc noise as irrelevant", () => {
  const result = scoreJob({
    title: "北京大学医学部感染免疫与微生物检验博士后",
    institution: "高校人才网",
    region: "Mainland China",
    roleType: "postdoc",
    trust: "aggregator",
    description: "人工智能辅助医学检验、感染免疫、微生物、临床医学方向。"
  }, keywords, new Date("2026-07-09T00:00:00Z"));

  assert.equal(result.priority, "D");
  assert.ok(result.matchScore < 40);
  assert.equal(result.relevance, "broad");
  assert.ok(result.negativeKeywords.includes("医学"));
});

test("keeps optimization and numerical analysis signals high", () => {
  const result = scoreJob({
    title: "Postdoctoral Fellow in machine learning optimization and numerical analysis",
    institution: "Example University",
    region: "Hong Kong",
    roleType: "postdoc",
    trust: "official",
    description: "Mathematical optimization, scientific computing, algorithms for variational inequalities."
  }, keywords, new Date("2026-07-09T00:00:00Z"));

  assert.notEqual(result.priority, "D");
  assert.equal(result.relevance, "core");
  assert.ok(result.matchedKeywords.includes("mathematical optimization"));
});

test("does not treat university names containing 交通 as transportation research", () => {
  const result = scoreJob({
    title: "上海交通大学张诗宜课题组2026年博士后招聘公告",
    institution: "高校人才网",
    region: "Mainland China",
    roleType: "postdoc",
    trust: "aggregator",
    description: "课题组招聘博士后、技术员，详情以官方公告为准。"
  }, keywords, new Date("2026-07-09T00:00:00Z"));

  assert.equal(result.priority, "D");
  assert.equal(result.matchedKeywords.includes("交通"), false);
});
