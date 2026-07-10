import test from "node:test";
import assert from "node:assert/strict";
import {
  extractAcademicIdentifiers,
  countPublicationTitleOverlaps,
  mergeIdentifierDiscoveries,
  resolveHomepageIdentifiers,
  resolveOrcidSearch,
  selectCrosscheckedOrcid
} from "../scripts/lib/identifier-discovery.mjs";

test("homepage identifier extraction deduplicates explicit scholarly links", () => {
  const identifiers = extractAcademicIdentifiers(`
    <a href="https://orcid.org/0000-0002-1825-0097">ORCID</a>
    <a href="https://orcid.org/0000-0002-1825-0097">ORCID duplicate</a>
    <a href="https://openalex.org/A12345">OpenAlex</a>
    <a href="https://scholar.google.com/citations?user=abc_DEF">Scholar</a>
  `);
  assert.deepEqual(identifiers.orcids, ["0000-0002-1825-0097"]);
  assert.deepEqual(identifiers.openAlexIds, ["A12345"]);
  assert.deepEqual(identifiers.googleScholarUsers, ["abc_DEF"]);
});

test("ORCID search requires one exact-name and matching-institution candidate", () => {
  const target = { internalId: "person-a", name: "Nicolas Boumal", officialInstitution: "EPFL" };
  const confirmed = resolveOrcidSearch(target, [{
    "orcid-id": "0000-0002-1322-958X",
    "given-names": "Nicolas",
    "family-names": "Boumal",
    "institution-name": ["EPFL - École Polytechnique Fédérale de Lausanne", "Princeton University"]
  }], "2026-07-10");
  assert.equal(confirmed.status, "confirmed_candidate");
  assert.equal(confirmed.orcid, "0000-0002-1322-958X");

  const rejected = resolveOrcidSearch(target, [{
    "orcid-id": "0000-0001-0000-0000",
    "given-names": "Nicolas",
    "family-names": "Boumal",
    "institution-name": ["Unrelated University"]
  }], "2026-07-10");
  assert.equal(rejected.status, "needs_review");
  assert.equal(rejected.orcid, null);
});

test("identifier discovery merge preserves non-empty values across sources", () => {
  const merged = mergeIdentifierDiscoveries(
    [{ id: "person-a", orcid: "0000-0002-1825-0097", openalex: null, status: "confirmed_candidate" }],
    [{ id: "person-a", orcid: null, openalex: null, status: "homepage_candidate", identifiers: { googleScholarUsers: ["abc"] } }]
  );
  assert.equal(merged.get("person-a").orcid, "0000-0002-1825-0097");
  assert.deepEqual(merged.get("person-a").identifiers.googleScholarUsers, ["abc"]);
});

test("ORCID title cross-check requires two exact homepage matches and a unique lead", () => {
  const page = "A Verified Optimization Paper (2025). Another Long Scientific Computing Result.";
  assert.deepEqual(
    countPublicationTitleOverlaps(page, [
      "A Verified Optimization Paper",
      "Another Long Scientific Computing Result",
      "Unrelated Paper"
    ]),
    ["A Verified Optimization Paper", "Another Long Scientific Computing Result"]
  );
  const selected = selectCrosscheckedOrcid([
    { orcid: "A", titleMatches: ["one", "two"] },
    { orcid: "B", titleMatches: ["one"] }
  ]);
  assert.equal(selected.status, "confirmed_candidate");
  assert.equal(selected.orcid, "A");
  assert.equal(selectCrosscheckedOrcid([{ orcid: "A", titleMatches: ["one"] }]).status, "needs_review");
});

test("only a unique homepage identifier becomes a second-stage candidate", () => {
  const item = { id: "person-a", name: "Ada", homepage: "https://example.edu/ada" };
  const unique = resolveHomepageIdentifiers(item, {
    orcids: ["0000-0002-1825-0097"],
    openAlexIds: [],
    googleScholarUsers: [],
    semanticScholarAuthorIds: []
  }, "2026-07-10");
  assert.equal(unique.status, "homepage_candidate");
  assert.equal(unique.orcid, "0000-0002-1825-0097");

  const ambiguous = resolveHomepageIdentifiers(item, {
    orcids: ["0000-0002-1825-0097", "0000-0001-5109-3700"],
    openAlexIds: [],
    googleScholarUsers: [],
    semanticScholarAuthorIds: []
  }, "2026-07-10");
  assert.equal(ambiguous.status, "needs_review");
  assert.equal(ambiguous.orcid, null);
});
