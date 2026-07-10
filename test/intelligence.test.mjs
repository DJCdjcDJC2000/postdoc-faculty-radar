import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("target labs are QS-scoped and evidence-backed", () => {
  const labs = readJson("data/manual/labs.json");

  assert.ok(labs.length >= 20);
  assert.ok(labs.filter((lab) => lab.authorityLevel).length >= 10);
  assert.ok(labs.some((lab) => String(lab.recruitmentStatus).includes("active")));
  assert.ok(labs.some((lab) => lab.region === "Hong Kong"));
  assert.ok(labs.some((lab) => lab.region === "Singapore"));
  assert.ok(labs.some((lab) => lab.region === "Europe"));

  for (const lab of labs) {
    assert.ok(lab.schoolScope.includes("QS"));
    assert.ok(Number.isFinite(Number(lab.qsRank2027)));
    assert.ok(lab.homepage);
    assert.ok(lab.recruitmentSignalZh);
    assert.ok(Array.isArray(lab.fieldTags) && lab.fieldTags.length > 0);
    assert.ok(Array.isArray(lab.evidence) && lab.evidence.length > 0);
  }
});

test("young scholar cases include background, works, and evidence", () => {
  const people = readJson("data/manual/people.json");
  const youngCases = people.filter((person) => String(person.kind).includes("young"));

  assert.ok(people.length >= 12);
  assert.ok(youngCases.length >= 10);
  assert.ok(people.filter((person) => person.authorityLevel).length >= 7);
  for (const person of people) {
    assert.ok(person.homepage);
    assert.ok(person.currentPosition);
    assert.ok(person.currentInstitution);
    assert.ok(Array.isArray(person.fieldTags) && person.fieldTags.length > 0);
    assert.ok(Array.isArray(person.representativePapers));
    assert.ok(Array.isArray(person.evidence) && person.evidence.length > 0);
  }
});

test("industry company radar has team-level coverage and scoring", () => {
  const companies = readJson("data/manual/industry-companies.json");

  assert.ok(companies.length >= 30);
  assert.ok(companies.flatMap((company) => company.teams ?? []).length >= 50);
  assert.ok(companies.filter((company) => company.category === "大陆科技大厂").length >= 8);
  assert.ok(companies.some((company) => company.category === "央国企研究院"));
  assert.ok(companies.some((company) => company.category === "量化金融"));
  for (const company of companies) {
    assert.ok(company.careerUrl);
    assert.ok(company.whyTrackZh);
    assert.ok(Array.isArray(company.teams) && company.teams.length > 0);
    for (const key of ["fitScore", "salaryScore", "supplyScore", "feasibilityScore", "growthScore", "identityRisk"]) {
      assert.ok(Number.isFinite(Number(company[key])), `${company.id} missing ${key}`);
    }
  }
});

test("industry opportunities are source-backed and relevance-scored", () => {
  const opportunities = readJson("data/manual/industry-opportunities.json");

  assert.ok(opportunities.length >= 20);
  assert.ok(opportunities.filter((item) => item.status === "active").length >= 10);
  assert.ok(opportunities.some((item) => String(item.track).includes("internship")));
  assert.ok(opportunities.some((item) => item.roleFamily.includes("优化")));
  for (const item of opportunities) {
    assert.ok(item.sourceUrl);
    assert.ok(item.summaryZh);
    assert.ok(Array.isArray(item.skills) && item.skills.length > 0);
    assert.ok(Number.isFinite(Number(item.fitScore)));
    assert.ok(Number.isFinite(Number(item.feasibilityScore)));
  }
});

test("industry people and path samples meet the first-release scope", () => {
  const people = readJson("data/manual/industry-people.json");
  const insights = readJson("data/manual/industry-insights.json");

  assert.ok(people.length >= 50);
  assert.ok(insights.anonymousPaths.length >= 20);
  assert.ok(insights.salaryBenchmarks.length >= 10);
  assert.ok(insights.skillDemand.length >= 10);
  assert.ok(people.some((person) => person.replicabilityScore >= 90));
  for (const person of people) {
    assert.ok(person.name);
    assert.ok(person.currentPosition);
    assert.ok(person.homepage);
    assert.ok(person.pathSummaryZh);
    assert.ok(Array.isArray(person.fieldTags) && person.fieldTags.length > 0);
    assert.ok(Array.isArray(person.evidence) && person.evidence.length > 0);
    assert.ok(Number.isFinite(Number(person.replicabilityScore)));
  }
});

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"));
}
