import test from "node:test";
import assert from "node:assert/strict";
import {
  buildIndustryCandidateDataset,
  hasIndependentCareerAndWorkEvidence,
  inferCompanyId
} from "../scripts/lib/industry-candidates.mjs";

const candidate = {
  idSuggestion: "person-new",
  name: "New Person",
  companyTeam: "JD.com Supply Chain Tech",
  position: "Researcher",
  region: "Mainland China",
  careerStage: "early-career",
  researchTags: ["supply chain optimization"],
  educationTransitionSummaryZh: "PhD to industry research.",
  paperPatentProjectEntries: [{ type: "paper", title: "A", url: "https://doi.org/10.1/a" }],
  profiles: { officialProfile: "https://jd.com/person" },
  evidence: [
    { type: "official_company_profile", url: "https://jd.com/person" },
    { type: "peer_reviewed_publication", url: "https://doi.org/10.1/a" }
  ],
  verifiedAt: "2026-07-10",
  uncertainties: []
};

test("industry candidates require independent career and work evidence", () => {
  assert.equal(hasIndependentCareerAndWorkEvidence(candidate), true);
  assert.equal(hasIndependentCareerAndWorkEvidence({ ...candidate, evidence: candidate.evidence.slice(0, 1), paperPatentProjectEntries: [] }), false);
});

test("industry import removes low-quality records and inserts verified replacements", () => {
  const dataset = buildIndustryCandidateDataset(
    [{ id: "old", name: "Old" }, { id: "keep", name: "Keep" }],
    { replaceIds: ["old"], candidates: [candidate] }
  );
  assert.equal(dataset.counts.final, 2);
  assert.deepEqual(dataset.people.map((item) => item.id), ["keep", "person-new"]);
  assert.equal(dataset.people[1].evidence[0].checkedAt, "2026-07-10");
});

test("company teams map to stable organization IDs", () => {
  assert.equal(inferCompanyId("Huawei Noah's Ark Lab"), "huawei");
  assert.equal(inferCompanyId("Cardinal Operations COPT"), "cardinal-operations");
  assert.equal(inferCompanyId("Unknown"), null);
});
