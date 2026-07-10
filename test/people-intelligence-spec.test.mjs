import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const projectRoot = path.resolve(import.meta.dirname, "..");
const config = JSON.parse(fs.readFileSync(
  path.join(projectRoot, "config/people-intelligence.json"),
  "utf8"
));

test("people intelligence scope matches the confirmed release target", () => {
  assert.equal(config.scope.targetLabs, 50);
  assert.equal(config.scope.youngScholars, 80);
  assert.ok(config.scope.industryPeopleMinimum >= 50);
  assert.equal(Object.values(config.scope.regionWeights).reduce((sum, value) => sum + value, 0), 1);
});

test("personal analysis remains private", () => {
  for (const key of [
    "personalFitIsPublic",
    "personalGapIsPublic",
    "applicationProbabilityIsPublic",
    "privateNotesArePublic"
  ]) {
    assert.equal(config.privacy[key], false);
  }
  assert.equal(config.privacy.privateSiteAccess, "single_owner_feishu_oauth");
});

test("matching weights are complete and explainable", () => {
  assert.equal(Object.values(config.matchingWeights).reduce((sum, value) => sum + value, 0), 100);
  assert.deepEqual(Object.keys(config.matchingWeights), [
    "researchProblem",
    "methodology",
    "publicationNetwork",
    "careerPath",
    "regionalFeasibility",
    "recruitmentAndCollaboration"
  ]);
});

test("recruitment signals distinguish openings from softer evidence", () => {
  const signals = new Map(config.recruitmentSignals.map((item) => [item.id, item]));
  assert.equal(signals.get("official_opening")?.countsAsOpen, true);
  for (const id of [
    "funded_expansion_signal",
    "accepts_applications",
    "fellowship_host"
  ]) {
    assert.equal(signals.get(id)?.countsAsOpen, false);
  }
});

test("publication and profile quality gates are explicit", () => {
  assert.equal(config.publicationPolicy.recentWindowYears, 5);
  assert.equal(config.publicationPolicy.preprintsCountTowardVenueTotals, false);
  assert.equal(config.minimumProfile.mentorRepresentativeWorks, 8);
  assert.equal(config.minimumProfile.youngScholarRepresentativeWorks, 5);
  assert.equal(config.minimumProfile.incompleteProfilesArePublic, false);
});
