import test from "node:test";
import assert from "node:assert/strict";
import {
  assessProfileReadiness,
  buildAcademicOverview,
  buildAcademicProfiles,
  normalizeRecruitmentSignals
} from "../scripts/lib/academic-intelligence.mjs";

const config = {
  minimumProfile: {
    officialIdentitySources: 1,
    bibliographicSources: 1,
    mentorRepresentativeWorks: 2,
    youngScholarRepresentativeWorks: 1,
    requiresResearchEvolution: true,
    requiresPublicationMetrics: true,
    requiresVenueBreakdown: true,
    requiresEvidenceForKeyClaims: true
  }
};

test("legacy recruitment status becomes evidence-aware signals", () => {
  const signals = normalizeRecruitmentSignals({
    recruitmentStatus: "active_group_openings",
    recruitmentSignalZh: "长期接受申请，也可作为 Fellowship host",
    openingsUrl: "https://example.edu/openings",
    lastVerifiedAt: "2026-07-10"
  });
  assert.ok(signals.some((item) => item.type === "official_opening"));
  assert.ok(signals.some((item) => item.type === "accepts_applications"));
  assert.ok(signals.every((item) => item.sourceUrl === "https://example.edu/openings"));
});

test("funded expansion and fellowship host remain separate from official openings", () => {
  const signals = normalizeRecruitmentSignals({
    recruitmentSignals: [
      { type: "funded_expansion_signal", sourceUrl: "https://example.edu/grant" },
      { type: "fellowship_host", sourceUrl: "https://example.edu/fellowship" }
    ]
  });
  assert.deepEqual(signals.map((item) => item.type), [
    "funded_expansion_signal",
    "fellowship_host"
  ]);
  assert.equal(signals.some((item) => item.type === "official_opening"), false);
});

test("academic profiles unify labs and young scholars", () => {
  const profiles = buildAcademicProfiles([
    {
      id: "lab-1",
      leadName: "Ada Mentor",
      institution: "Example University",
      groupName: "Optimization Lab",
      groupHomepage: "https://example.edu/lab",
      homepage: "https://example.edu/ada",
      fieldTags: ["optimization"],
      researchEvolution: ["robust optimization"],
      publicationMetrics: { worksCount: 20, recentWorksCount: 8, updatedAt: "2026-07-10" },
      venueBreakdown: [{ track: "optimization", tier: "top_core", count: 3 }],
      representativeWorks: [{ title: "A" }, { title: "B" }],
      evidence: [{ type: "official_profile" }, { type: "openalex_author" }],
      lastVerifiedAt: "2026-07-10"
    }
  ], [
    {
      id: "person-1",
      kind: "young_faculty_case",
      name: "Young Scholar",
      currentPosition: "Assistant Professor",
      currentInstitution: "Example University",
      fieldTags: ["scientific computing"],
      researchEvolution: ["operator learning"],
      publicationMetrics: { worksCount: 10, recentWorksCount: 6, updatedAt: "2026-07-10" },
      venueBreakdown: [{ track: "scientific_computing", tier: "top_core", count: 2 }],
      representativePapers: [{ title: "C" }],
      phdInstitution: "Example Institute",
      postdocHistory: [],
      evidence: [{ type: "official_homepage" }, { type: "google_scholar" }],
      lastVerifiedAt: "2026-07-10"
    }
  ], config);

  assert.equal(profiles.length, 2);
  assert.equal(profiles[0].profileType, "mentor_group");
  assert.equal(profiles[1].profileType, "young_scholar");
  assert.ok(profiles.every((profile) => profile.quality.isPublicReady));
});

test("quality gate lists missing research and publication evidence", () => {
  const quality = assessProfileReadiness({
    profileType: "young_scholar",
    representativeWorks: [],
    timeline: [],
    evidence: []
  }, config);
  assert.equal(quality.isPublicReady, false);
  assert.ok(quality.missing.includes("bibliographicIdentity"));
  assert.ok(quality.missing.includes("researchEvolution"));
  assert.ok(quality.missing.includes("publicationMetrics"));
  assert.ok(quality.missing.includes("representativeWorks"));
});

test("overview counts multiple recruitment signal types", () => {
  const overview = buildAcademicOverview([
    {
      profileType: "mentor_group",
      region: "Europe",
      research: { tags: ["optimization"] },
      quality: { isPublicReady: true },
      publicationMetrics: { updatedAt: "2026-07-10" },
      recruitmentSignals: [
        { type: "official_opening" },
        { type: "fellowship_host" }
      ]
    },
    {
      profileType: "young_scholar",
      region: "Hong Kong",
      research: { tags: ["optimization", "scientific computing"] },
      quality: { isPublicReady: false },
      recruitmentSignals: [{ type: "funded_expansion_signal" }]
    }
  ]);
  assert.equal(overview.totalProfiles, 2);
  assert.equal(overview.readyProfiles, 1);
  assert.equal(overview.officialOpenings, 1);
  assert.equal(overview.expansionSignals, 1);
  assert.equal(overview.fellowshipHosts, 1);
  assert.equal(overview.topResearchTags[0].value, "optimization");
});

test("verified aliases merge one person into a canonical multi-role profile", () => {
  const profiles = buildAcademicProfiles([
    {
      id: "lab-ada",
      leadName: "Ada Mentor",
      groupName: "Optimization Lab",
      homepage: "https://example.edu/ada",
      groupHomepage: "https://example.edu/lab",
      fieldTags: ["optimization"],
      representativeWorks: [
        { title: "Paper A", year: 2024, url: "https://example.edu/ada/publications" },
        { title: "Paper B", year: 2023, url: "https://example.edu/ada/publications" }
      ],
      recruitmentSignals: [{ type: "no_public_signal", sourceUrl: "https://example.edu/ada" }],
      evidence: [{ type: "official_profile", url: "https://example.edu/ada" }]
    }
  ], [
    {
      id: "person-ada",
      kind: "young_faculty_case",
      name: "Ada Mentor",
      currentPosition: "Assistant Professor",
      currentInstitution: "Example University",
      homepage: "https://example.edu/ada",
      fieldTags: ["scientific computing"],
      representativePapers: [],
      recruitmentSignals: [{ type: "no_public_signal" }],
      evidence: [{ type: "google_scholar", url: "https://scholar.example/ada" }]
    }
  ], config, {
    canonicalPeople: [{
      id: "person-ada-mentor",
      name: "Ada Mentor",
      aliases: { labs: ["lab-ada"], people: ["person-ada"] },
      evidence: [{ type: "same_official_homepage", url: "https://example.edu/ada" }]
    }]
  });

  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].id, "person-ada-mentor");
  assert.deepEqual(profiles[0].profileTypes, ["mentor_group", "young_scholar"]);
  assert.deepEqual(profiles[0].sourceRecordIds, {
    labs: ["lab-ada"],
    people: ["person-ada"]
  });
  assert.deepEqual(profiles[0].research.tags, ["optimization", "scientific computing"]);
  assert.equal(profiles[0].representativeWorks.length, 2);
  assert.equal(profiles[0].recruitmentSignals.length, 1);
});
