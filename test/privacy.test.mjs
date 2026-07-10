import test from "node:test";
import assert from "node:assert/strict";
import { assertNoPrivateFields, stripPrivateFields } from "../scripts/lib/privacy.mjs";
import {
  sanitizeIntelligenceForBuild,
  sanitizePublicAcademicPerson,
  sanitizePublicIndustry,
  sanitizePublicLab
} from "../scripts/lib/public-intelligence.mjs";

test("strips private fields recursively from public output", () => {
  const value = {
    id: "job-1",
    title: "Postdoc",
    private: {
      myStage: "收藏"
    },
    nested: {
      myPriority: "P0",
      publicValue: true,
      items: [
        {
          privateNotes: "do not leak",
          visible: "ok"
        }
      ]
    }
  };

  const stripped = stripPrivateFields(value);
  assert.equal(stripped.private, undefined);
  assert.equal(stripped.nested.myPriority, undefined);
  assert.equal(stripped.nested.items[0].privateNotes, undefined);
  assert.equal(stripped.nested.items[0].visible, "ok");
  assert.doesNotThrow(() => assertNoPrivateFields(stripped));
});

test("detects private field leaks in public structures", () => {
  assert.throws(
    () => assertNoPrivateFields({ profile: { privateSummaryZh: "hidden" } }),
    /Private field leaked/
  );
});

test("blocks the expanded private person overlay contract", () => {
  const privateOverlay = {
    applicationProbability: 0.7,
    matching: { researchProblem: 90 },
    actionCard: { nextAction: "Contact later" },
    contactHistory: [{ at: "2026-07-10" }],
    emailDrafts: ["Private draft"],
    ownerProfile: { ownerId: "private-owner" },
    quarterlyPlan: [{ quarter: "2026-Q3" }]
  };
  const stripped = stripPrivateFields({ id: "person-1", ...privateOverlay });
  assert.deepEqual(stripped, { id: "person-1" });
  assert.throws(() => assertNoPrivateFields(privateOverlay), /Private field leaked/);
});

test("public lab data omits personal matching while retaining public evidence", () => {
  const lab = {
    id: "lab-1",
    leadName: "Public Researcher",
    institution: "Public University",
    fieldTags: ["optimization"],
    recruitmentStatus: "active_openings",
    recruitmentSignalZh: "Official careers page lists a postdoc opening.",
    matchLevel: "A",
    matchScore: 95,
    fitZh: "Closely matches my research.",
    whyTrackZh: "I should contact this lab.",
    evidence: [{ type: "official_openings", url: "https://example.com/openings" }]
  };

  const sanitized = sanitizePublicLab(lab);

  assert.deepEqual(sanitized, {
    id: "lab-1",
    leadName: "Public Researcher",
    institution: "Public University",
    fieldTags: ["optimization"],
    recruitmentStatus: "active_openings",
    recruitmentSignalZh: "Official careers page lists a postdoc opening.",
    evidence: [{ type: "official_openings", url: "https://example.com/openings" }]
  });
});

test("public academic people omit personal takeaways from manual and AI data", () => {
  const person = {
    id: "person-1",
    name: "Public Scholar",
    currentPosition: "Assistant Professor",
    currentInstitution: "Public University",
    priority: "P1",
    pathSummaryZh: "PhD, postdoc, then assistant professor.",
    learningsZh: ["This path would help me."],
    risksZh: ["My profile has a gap."],
    representativePapers: [{ title: "Public Paper", year: "2025" }],
    evidence: [{ type: "official_profile", url: "https://example.com/profile" }],
    ai: {
      status: "generated",
      notice: "AI generated, verify before use",
      careerPathZh: "Publicly documented career path.",
      learningsZh: ["Personal action advice."],
      risksZh: ["Personal application risk."]
    }
  };

  const sanitized = sanitizePublicAcademicPerson(person);

  assert.deepEqual(sanitized, {
    id: "person-1",
    name: "Public Scholar",
    currentPosition: "Assistant Professor",
    currentInstitution: "Public University",
    pathSummaryZh: "PhD, postdoc, then assistant professor.",
    representativePapers: [{ title: "Public Paper", year: "2025" }],
    evidence: [{ type: "official_profile", url: "https://example.com/profile" }],
    ai: {
      status: "generated",
      notice: "AI generated, verify before use",
      careerPathZh: "Publicly documented career path."
    }
  });
});

test("public industry data omits personal scoring and advice while retaining facts", () => {
  const industry = {
    updatedAt: "2026-07-10",
    sourcePolicyZh: "Use official sources.",
    companies: [{
      id: "company-1",
      name: "Public Company",
      teams: ["Optimization Research"],
      priority: "P1",
      fitScore: 92,
      feasibilityScore: 88,
      identityRisk: 8,
      overallScore: 90,
      whyTrackZh: "This is one of my best targets.",
      supplyScore: 94,
      salaryScore: 84,
      growthScore: 91,
      salaryBandZh: "Publicly reported salary range.",
      careerUrl: "https://example.com/careers"
    }],
    opportunities: [{
      id: "opportunity-1",
      title: "Research Scientist",
      status: "active",
      availabilityZh: "Open now, but my target window is 2028.",
      summaryZh: "I should prepare for this role next year.",
      timingFit: "future_action",
      fitScore: 90,
      feasibilityScore: 70,
      identityRisk: 30,
      overallScore: 79,
      supplyScore: 80,
      salaryScore: 85,
      skills: ["optimization"],
      sourceUrl: "https://example.com/job",
      confidence: "A"
    }],
    people: [{
      id: "industry-person-1",
      name: "Public Researcher",
      currentPosition: "Research Director",
      educationSummaryZh: "Public education history.",
      pathSummaryZh: "Public career path.",
      replicabilityScore: 42,
      replicabilityZh: "My background is not yet comparable.",
      representativeWorks: [{ title: "Public Work" }],
      evidence: [{ type: "official_profile", url: "https://example.com/person" }]
    }]
  };

  const sanitized = sanitizePublicIndustry(industry);

  assert.deepEqual(sanitized, {
    updatedAt: "2026-07-10",
    sourcePolicyZh: "Use official sources.",
    companies: [{
      id: "company-1",
      name: "Public Company",
      teams: ["Optimization Research"],
      supplyScore: 94,
      salaryScore: 84,
      growthScore: 91,
      salaryBandZh: "Publicly reported salary range.",
      careerUrl: "https://example.com/careers"
    }],
    opportunities: [{
      id: "opportunity-1",
      title: "Research Scientist",
      status: "active",
      supplyScore: 80,
      salaryScore: 85,
      skills: ["optimization"],
      sourceUrl: "https://example.com/job",
      confidence: "A"
    }],
    people: [{
      id: "industry-person-1",
      name: "Public Researcher",
      currentPosition: "Research Director",
      educationSummaryZh: "Public education history.",
      pathSummaryZh: "Public career path.",
      representativeWorks: [{ title: "Public Work" }],
      evidence: [{ type: "official_profile", url: "https://example.com/person" }]
    }]
  });
});

test("build-mode sanitizer cleans public data and leaves private data intact", () => {
  const siteData = {
    jobs: [{ id: "job-1", title: "Public job fact" }],
    labs: [{ id: "lab-1", matchScore: 95, institution: "Public University" }],
    people: [{
      id: "person-1",
      priority: "P1",
      name: "Public Scholar",
      ai: { careerPathZh: "Public path", risksZh: ["Personal risk"] }
    }],
    industry: {
      companies: [{ id: "company-1", fitScore: 90, name: "Public Company" }],
      opportunities: [{ id: "opportunity-1", overallScore: 80, title: "Public role" }],
      people: [{ id: "industry-person-1", replicabilityScore: 50, name: "Public Researcher" }]
    },
    updates: {
      items: [
        { id: "opportunity-1", kind: "industry", score: 80, title: "Public role" },
        { id: "job-1", kind: "academic", score: 75, title: "Public job fact" }
      ]
    }
  };

  const publicOutput = sanitizeIntelligenceForBuild(siteData, "public");
  const privateOutput = sanitizeIntelligenceForBuild(siteData, "private");

  assert.equal(publicOutput.labs[0].matchScore, undefined);
  assert.equal(publicOutput.people[0].priority, undefined);
  assert.equal(publicOutput.people[0].ai.risksZh, undefined);
  assert.equal(publicOutput.industry.companies[0].fitScore, undefined);
  assert.equal(publicOutput.industry.opportunities[0].overallScore, undefined);
  assert.equal(publicOutput.industry.people[0].replicabilityScore, undefined);
  assert.equal(publicOutput.updates.items[0].score, undefined);
  assert.equal(publicOutput.updates.items[1].score, 75);
  assert.deepEqual(publicOutput.jobs, siteData.jobs);

  assert.strictEqual(privateOutput, siteData);
  assert.equal(privateOutput.labs[0].matchScore, 95);
  assert.equal(privateOutput.people[0].ai.risksZh[0], "Personal risk");
  assert.equal(privateOutput.industry.companies[0].fitScore, 90);
  assert.equal(privateOutput.industry.opportunities[0].overallScore, 80);
  assert.equal(privateOutput.industry.people[0].replicabilityScore, 50);
  assert.equal(privateOutput.updates.items[0].score, 80);
});
