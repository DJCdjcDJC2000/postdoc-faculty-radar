import test from "node:test";
import assert from "node:assert/strict";
import { academicAnalysisFingerprint, normalizeAcademicAnalysis, shouldAnalyzeAcademicProfile } from "../scripts/lib/academic-deepseek-analysis.mjs";

const profile = {
  id: "person-1",
  name: "Ada Scholar",
  institution: "Example University",
  research: { tags: ["stochastic optimization"], methods: ["first-order methods"], applications: [] },
  publicationMetrics: { worksCount: 10 },
  representativeWorks: [{ title: "Paper A", year: 2025, venue: "Journal A" }],
  timeline: [{ type: "phd", institution: "Example Institute", year: 2024 }],
  recruitmentSignals: [],
  lastVerifiedAt: "2026-07-10",
};

test("academic DeepSeek analysis is incremental and public-only", () => {
  const fingerprint = academicAnalysisFingerprint(profile);
  assert.equal(shouldAnalyzeAcademicProfile(profile, {}), true);
  assert.equal(shouldAnalyzeAcademicProfile(profile, { "person-1": { profileFingerprint: fingerprint } }), false);

  const result = normalizeAcademicAnalysis({
    researchSummaryZh: "研究随机优化。",
    methods: ["first-order methods", "first-order methods"],
    applications: ["energy systems"],
    careerPatternZh: "博士毕业后进入高校。",
    caveatsZh: ["计数需核验。"],
    personalAnalysisZh: "must be dropped",
  }, profile, "2026-07-10T00:00:00Z");

  assert.deepEqual(result.methods, ["first-order methods"]);
  assert.equal(result.careerPatternZh, "博士毕业后进入高校。");
  assert.equal("personalAnalysisZh" in result, false);
  assert.equal(result.notice, "AI 辅助归纳，需回到公开证据核验");
});

test("academic fingerprint ignores AI output and volatile verification timestamps", () => {
  const baseline = academicAnalysisFingerprint(profile);
  const rebuilt = academicAnalysisFingerprint({
    ...profile,
    lastVerifiedAt: "2026-07-11T01:00:00Z",
    research: {
      ...profile.research,
      summaryZh: "AI-generated replacement",
      methods: ["AI-derived method"],
      applications: ["AI-derived application"],
    },
    publicationMetrics: { ...profile.publicationMetrics, updatedAt: "2026-07-11T01:00:00Z" },
    publicAnalysis: { careerPatternZh: "AI-generated career summary" },
  });
  const changedWork = academicAnalysisFingerprint({
    ...profile,
    representativeWorks: [{ title: "Paper B", year: 2025, venue: "Journal A" }],
  });

  assert.equal(rebuilt, baseline);
  assert.notEqual(changedWork, baseline);
});
