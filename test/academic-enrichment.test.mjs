import test from "node:test";
import assert from "node:assert/strict";
import { applyAcademicEnrichment, indexConfirmedEnrichments } from "../scripts/lib/academic-enrichment.mjs";
import taxonomy from "../config/venue-taxonomy.json" with { type: "json" };

const baseProfile = {
  id: "person-a",
  canonicalId: "person-a",
  research: { recentEvolution: [] },
  representativeWorks: [],
  links: {},
  evidence: [{ type: "official_profile", url: "https://example.edu/a" }]
};

function enrichment(status = "confirmed") {
  return {
    schemaVersion: "1.0.0",
    provider: "OpenAlex",
    profiles: [{
      internalId: "person-a",
      fetchedAt: "2026-07-10T00:00:00.000Z",
      resolution: { status, confidence: "high" },
      author: {
        openAlexId: "A123",
        openAlexUrl: "https://openalex.org/A123",
        orcid: "https://orcid.org/0000-0000-0000-0001"
      },
      metrics: { worksCount: 20, recentWorksCount: 5, citedByCount: 100 },
      conceptTrends: [{
        displayName: "Robust Optimization",
        trend: "rising",
        worksCount: 4,
        citedByCount: 20,
        shareOfWorks: 0.8,
        yearly: []
      }],
      works: [{
        openAlexId: "W1",
        openAlexUrl: "https://openalex.org/W1",
        doi: "https://doi.org/10.1137/1.9781611975994.10",
        title: "A paper",
        publicationYear: 2025,
        type: "article",
        citedByCount: 10,
        source: {
          id: "S173133133",
          displayName: "SIAM Journal on Optimization",
          issnL: "1052-6234"
        },
        selectionReason: "recent",
        selectionReasons: ["recent"],
        isRecent: true
      }]
    }]
  };
}

test("only confirmed independently resolved OpenAlex identities are indexed", () => {
  assert.equal(indexConfirmedEnrichments(enrichment("needs_review")).size, 0);
  assert.equal(indexConfirmedEnrichments(enrichment("confirmed")).size, 1);
});

test("confirmed enrichment adds metrics, research evolution, venues, works, and evidence", () => {
  const [profile] = applyAcademicEnrichment([baseProfile], enrichment(), taxonomy);
  assert.equal(profile.publicationMetrics.provider, "OpenAlex");
  assert.equal(profile.publicationMetrics.recentWorksCount, 5);
  assert.equal(profile.research.recentEvolution[0].topic, "Robust Optimization");
  assert.equal(profile.representativeWorks[0].title, "A paper");
  assert.equal(profile.links.openalex, "https://openalex.org/A123");
  assert.equal(profile.venueBreakdown.find((item) => item.track === "optimization_operations_research" && item.tier === "top_core").count, 1);
  assert.ok(profile.evidence.some((item) => item.type === "openalex_author"));
});

test("unconfirmed enrichment leaves the public profile unchanged", () => {
  const [profile] = applyAcademicEnrichment([baseProfile], enrichment("needs_review"), taxonomy);
  assert.equal(profile, baseProfile);
});

test("ORCID enrichment is used when no higher-priority OpenAlex profile exists", () => {
  const document = {
    provider: "ORCID",
    profiles: [{
      internalId: "person-a",
      fetchedAt: "2026-07-10T00:00:00.000Z",
      resolution: { status: "confirmed", confidence: "exact_orcid_and_name" },
      author: {
        orcid: "0000-0000-0000-0001",
        orcidUrl: "https://orcid.org/0000-0000-0000-0001"
      },
      metrics: {
        worksCount: 12,
        recentWorksCount: 5,
        countLabelZh: "ORCID / Crossref 关联成果记录",
        sourceCounts: { orcidRecordCount: 8, crossrefOrcidWorksCount: 6, mergedRecordCount: 12 }
      },
      conceptTrends: [{ displayName: "Optimization", trend: "active", worksCount: 5 }],
      works: Array.from({ length: 8 }, (_, index) => ({
        title: `Paper ${index}`,
        publicationYear: 2026 - index,
        type: "journal-article",
        source: { displayName: "SIAM Journal on Optimization" }
      }))
    }]
  };
  const [profile] = applyAcademicEnrichment([baseProfile], document, taxonomy);
  assert.equal(profile.publicationMetrics.provider, "ORCID");
  assert.equal(profile.publicationMetrics.countLabelZh, "ORCID / Crossref 关联成果记录");
  assert.equal(profile.publicationMetrics.crossSourceCounts.mergedRecordCount, 12);
  assert.equal(profile.links.orcid, "https://orcid.org/0000-0000-0000-0001");
  assert.equal(profile.representativeWorks.length, 8);
});
