import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAcademicCandidateDataset,
  normalizeRecruitmentCandidateSignal,
  parsePhdYear
} from "../scripts/lib/academic-candidates.mjs";

const lab = {
  id: "lab-a",
  name: "Ada Lab",
  institution: "Example University",
  region: "Europe",
  positionStage: "Professor",
  homepage: "https://example.edu/ada",
  groupOrOpeningsUrl: "https://example.edu/ada/openings",
  researchTags: ["optimization"],
  recruitmentSignal: {
    type: "funding_expansion",
    evidenceUrl: "https://example.edu/grant",
    note: "Active grant only; this is not an opening."
  },
  sources: ["https://example.edu/ada"],
  verifiedAt: "2026-07-10"
};

const young = {
  id: "young-a",
  name: "Young Scholar",
  institution: "Example University",
  region: "Europe",
  positionStage: "Assistant Professor; PhD 2021",
  homepage: "https://example.edu/young",
  researchTags: ["variational inequalities"],
  recruitmentSignal: { type: "rolling_application_or_fellowship_host", evidenceUrl: "https://example.edu/young" },
  sources: ["https://example.edu/young"],
  ids: { openalex: "https://openalex.org/A123" },
  verifiedAt: "2026-07-10"
};

test("candidate import maps soft signals without turning them into official openings", () => {
  assert.deepEqual(
    normalizeRecruitmentCandidateSignal(lab.recruitmentSignal, "2026-07-10").map((item) => item.type),
    ["funded_expansion_signal"]
  );
  assert.deepEqual(
    normalizeRecruitmentCandidateSignal(young.recruitmentSignal, "2026-07-10").map((item) => item.type),
    ["accepts_applications", "fellowship_host"]
  );
});

test("candidate import deduplicates existing people and requires a young-scholar PhD year", () => {
  const missingYear = { ...young, id: "young-b", name: "No Year", positionStage: "Postdoctoral Researcher" };
  const dataset = buildAcademicCandidateDataset(
    [{ mentorLabs: [lab], youngScholars: [young, missingYear] }],
    { labs: [{ id: "existing", leadName: "Existing" }], people: [] }
  );
  assert.equal(dataset.labs.length, 1);
  assert.equal(dataset.people.length, 1);
  assert.equal(dataset.review[0].reason, "missing_verified_phd_year");
  assert.equal(dataset.people[0].phdYear, 2021);
  assert.equal(dataset.people[0].openalex, "https://openalex.org/A123");
});

test("PhD years are parsed from explicit and position-stage fields", () => {
  assert.equal(parsePhdYear({ phdYear: 2020 }), 2020);
  assert.equal(parsePhdYear({ positionStage: "Associate Professor; PhD 2018" }), 2018);
  assert.equal(parsePhdYear({ positionStage: "Postdoctoral Researcher" }), null);
});
