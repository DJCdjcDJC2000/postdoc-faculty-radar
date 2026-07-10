import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVenueBreakdown,
  classifyVenue,
  classifyWorks,
  normalizeDoi,
  normalizeIssn,
  normalizeVenueName
} from "../scripts/lib/venue-classification.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const taxonomy = JSON.parse(fs.readFileSync(
  path.join(projectRoot, "config/venue-taxonomy.json"),
  "utf8"
));

const TRACKS = [
  "optimization_operations_research",
  "numerical_analysis_scientific_computing",
  "complementarity_vi_nonsmooth",
  "machine_learning_optimization",
  "interdisciplinary_applications"
];
const TIERS = ["top_core", "important_mainstream", "related_reference"];

test("taxonomy has exactly the five confirmed tracks and three populated tiers", () => {
  assert.deepEqual(taxonomy.tracks.map((track) => track.id), TRACKS);
  assert.deepEqual(taxonomy.tierIds, TIERS);
  for (const track of taxonomy.tracks) {
    assert.deepEqual(Object.keys(track.tiers), TIERS);
    assert.ok(TIERS.every((tier) => track.tiers[tier].length > 0));
  }
});

test("all researched venues are archival channels backed by official URLs", () => {
  const requiredVenueIds = [
    "mathematical_programming",
    "siam_journal_on_optimization",
    "mathematics_of_operations_research",
    "operations_research",
    "management_science",
    "mathematical_programming_computation",
    "ipco",
    "siam_journal_on_numerical_analysis",
    "siam_journal_on_scientific_computing",
    "numerische_mathematik",
    "mathematics_of_computation",
    "acta_numerica",
    "ima_journal_of_numerical_analysis",
    "acm_transactions_on_mathematical_software",
    "journal_of_computational_physics",
    "m2an",
    "set_valued_and_variational_analysis",
    "journal_of_optimization_theory_and_applications",
    "computational_optimization_and_applications",
    "siam_journal_on_control_and_optimization",
    "neurips",
    "icml",
    "iclr",
    "colt",
    "jmlr",
    "aistats",
    "tmlr",
    "siam_journal_on_mathematics_of_data_science",
    "uai",
    "mlsys"
  ];

  assert.deepEqual(taxonomy.venues.map((venue) => venue.id), requiredVenueIds);
  for (const venue of taxonomy.venues) {
    assert.equal(venue.publicationClass, "archival_publication");
    assert.ok(venue.sourceUrls.length > 0, `${venue.id} needs an official source`);
    assert.ok(venue.sourceUrls.every((url) => new URL(url).protocol === "https:"));
  }
  assert.equal(taxonomy.publicationPolicy.preprintsCount, false);
  assert.equal(taxonomy.publicationPolicy.nonarchivalEventsCount, false);
  assert.equal(taxonomy.publicationPolicy.multiTrackGlobalCount, "once");
});

test("normalizers handle resolver DOI, ISSN-L, and bibliographic venue spelling", () => {
  assert.equal(normalizeDoi("https://doi.org/10.1287/MOOR.2024.001."), "10.1287/moor.2024.001");
  assert.equal(normalizeIssn("10526234"), "1052-6234");
  assert.equal(
    normalizeVenueName("Proceedings of the 42nd International Conference on Machine Learning, 2025"),
    "international conference on machine learning"
  );
});

test("identifier matching follows DOI, ISSN-L, venue id, then normalized name", () => {
  const byDoi = classifyVenue({
    doi: "https://doi.org/10.1287/moor.2024.001",
    issnL: "0025-1909",
    venueId: "openalex:S33323087",
    venueName: "Management Science",
    type: "journal-article"
  });
  assert.equal(byDoi.venueId, "mathematics_of_operations_research");
  assert.equal(byDoi.matchedBy, "doi");

  const byIssn = classifyVenue({
    issn: "1095-7189",
    venueId: "openalex:S33323087",
    venueName: "Management Science"
  });
  assert.equal(byIssn.venueId, "siam_journal_on_optimization");
  assert.equal(byIssn.matchedBy, "issn_l");

  const byVenueId = classifyVenue({
    venueId: "https://openalex.org/S203348814",
    venueName: "Management Science"
  });
  assert.equal(byVenueId.venueId, "siam_journal_on_numerical_analysis");
  assert.equal(byVenueId.matchedBy, "venue_id");

  const byName = classifyVenue("SIAM J. Optim.");
  assert.equal(byName.venueId, "siam_journal_on_optimization");
  assert.equal(byName.matchedBy, "normalized_name");

  const proceedingsName = classifyVenue({
    venueName: "Proceedings of the 42nd International Conference on Machine Learning, 2025",
    type: "conference-paper"
  });
  assert.equal(proceedingsName.venueId, "icml");

  const crossrefName = classifyVenue({
    "container-title": ["Mathematical Programming"],
    type: "journal-article"
  });
  assert.equal(crossrefName.venueId, "mathematical_programming");
});

test("archival papers count while preprints and event-only records do not", () => {
  const paper = classifyVenue({ venueName: "NeurIPS", type: "conference-paper" });
  assert.equal(paper.publicationClass, "archival_publication");
  assert.equal(paper.count, 1);

  const event = classifyVenue({ venueName: "NeurIPS", type: "conference" });
  assert.equal(event.publicationClass, "nonarchival_event");
  assert.equal(event.count, 0);
  assert.equal(event.exclusionReason, "nonarchival_event");

  const workshop = classifyVenue({ venueName: "NeurIPS", type: "workshop presentation" });
  assert.equal(workshop.publicationClass, "nonarchival_event");
  assert.equal(workshop.count, 0);

  const workshopPaper = classifyVenue({ venueName: "NeurIPS", type: "workshop paper" });
  assert.equal(workshopPaper.publicationClass, "nonarchival_event");
  assert.equal(workshopPaper.count, 0);

  const preprint = classifyVenue({ venueName: "NeurIPS", type: "preprint" });
  assert.equal(preprint.publicationClass, "preprint");
  assert.equal(preprint.count, 0);
  assert.equal(preprint.exclusionReason, "preprint");
});

test("work_family deduplication counts a multi-track work once globally", () => {
  const result = classifyWorks([
    { work_family: "family-a", title: "A", type: "preprint", venueName: "arXiv" },
    { work_family: "family-a", title: "A", type: "journal-article", issnL: "1052-6234" },
    { workFamily: "family-b", title: "B", type: "conference-paper", venueName: "NeurIPS" },
    { workFamily: "family-b", title: "B", type: "conference-paper", venueId: "dblp:conf/nips" },
    { workFamily: "family-c", title: "C", type: "conference", venueName: "NeurIPS" }
  ]);

  assert.equal(result.inputCount, 5);
  assert.equal(result.familyCount, 3);
  assert.equal(result.deduplicatedCount, 2);
  assert.equal(result.globalCount, 2);
  assert.equal(result.excludedCount, 1);
  assert.equal(result.counts.byTrack.optimization_operations_research, 1);
  assert.equal(result.counts.byTrack.complementarity_vi_nonsmooth, 1);
  assert.equal(result.counts.byTrack.machine_learning_optimization, 1);
  assert.equal(result.works.find((work) => work.workFamily === "family:family-a").sourceWorkCount, 2);
});

test("breakdown emits a count for every track and tier", () => {
  const breakdown = buildVenueBreakdown([
    { workFamily: "family-a", venueName: "SIOPT", type: "journal-article" }
  ]);
  assert.equal(breakdown.length, TRACKS.length * TIERS.length);
  assert.deepEqual(
    breakdown.find((item) => item.track === "optimization_operations_research" && item.tier === "top_core"),
    { track: "optimization_operations_research", tier: "top_core", count: 1 }
  );
  assert.deepEqual(
    breakdown.find((item) => item.track === "complementarity_vi_nonsmooth" && item.tier === "top_core"),
    { track: "complementarity_vi_nonsmooth", tier: "top_core", count: 1 }
  );
});
