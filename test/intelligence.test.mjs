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

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"));
}
