import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OpenAlexClient,
  buildAcademicTargets,
  buildAuthorMetrics,
  buildConceptTrends,
  buildOpenAlexCacheKey,
  chooseAuthorCandidate,
  createOpenAlexUrl,
  hydrateAuthorCandidate,
  institutionSimilarity,
  mergeWorkSelections,
  normalizeOpenAlexId,
  parseOpenAlexArguments,
  rankAuthorCandidates,
  retryDelayMs,
  scoreAuthorCandidate,
  writeJsonAtomically
} from "../scripts/lib/openalex.mjs";
import { loadAcademicTargets } from "../scripts/enrich-academic-openalex.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

test("manual IDs remain stable and explicit OpenAlex IDs are normalized", () => {
  const targets = buildAcademicTargets([
    {
      id: "lab-stable-id",
      leadName: "Ada Mentor",
      institution: "Example University",
      openalex: "https://openalex.org/A1234567890",
      orcid: "https://orcid.org/0000-0000-0000-0001",
      fieldTags: ["optimization"]
    }
  ], [
    {
      id: "person-stable-id",
      name: "Young Scholar",
      currentInstitution: "Other University",
      openalex: "",
      fieldTags: ["scientific computing"]
    }
  ]);

  assert.deepEqual(targets.map((target) => target.internalId), [
    "lab-stable-id",
    "person-stable-id"
  ]);
  assert.equal(targets[0].explicitOpenAlexId, "A1234567890");
  assert.equal(targets[0].explicitOrcid, "0000-0000-0000-0001");
  assert.equal(targets[1].explicitOpenAlexId, null);
  assert.deepEqual(targets[0].trackedPeerNames, ["Young Scholar"]);
  assert.equal(normalizeOpenAlexId("https://api.openalex.org/authors/a987"), "A987");
  assert.equal(normalizeOpenAlexId("https://openalex.org/W987"), null);
});

test("duplicate manual IDs fail instead of generating unstable replacements", () => {
  assert.throws(() => buildAcademicTargets(
    [{ id: "same-id", leadName: "First", institution: "One" }],
    [{ id: "same-id", name: "Second", currentInstitution: "Two" }]
  ), /Duplicate academic internal ID/);
  assert.throws(() => buildAcademicTargets([
    { id: "bad-openalex", leadName: "First", institution: "One", openalex: "not-an-id" }
  ], []), /invalid explicit OpenAlex author ID/);
  assert.equal(institutionSimilarity("University", "College"), 0);
});

test("verified identity aliases merge duplicate lab and person records under one stable person ID", () => {
  const targets = buildAcademicTargets([
    {
      id: "lab-ada",
      leadName: "Ada Mentor",
      institution: "Example University",
      fieldTags: ["optimization"]
    }
  ], [
    {
      id: "person-ada",
      name: "Ada Mentor",
      currentInstitution: "Example University",
      fieldTags: ["scientific computing"]
    }
  ], {
    canonicalPeople: [{
      id: "person-ada-mentor",
      name: "Ada Mentor",
      aliases: { labs: ["lab-ada"], people: ["person-ada"] }
    }]
  });

  assert.equal(targets.length, 1);
  assert.equal(targets[0].internalId, "person-ada-mentor");
  assert.equal(targets[0].sourceKind, "lab_and_person");
  assert.deepEqual(targets[0].sourceRecordIds, {
    labs: ["lab-ada"],
    people: ["person-ada"]
  });
  assert.deepEqual(targets[0].topicHints, ["optimization", "scientific computing"]);
});

test("the actual main inputs apply every verified canonical identity mapping", async () => {
  const { labs, people, identityConfig, targets } = await loadAcademicTargets(repositoryRoot);
  const canonicalPeople = identityConfig.canonicalPeople ?? [];
  const aliasedSourceRecords = canonicalPeople.reduce((total, identity) => (
    total + (identity.aliases?.labs?.length ?? 0) + (identity.aliases?.people?.length ?? 0)
  ), 0);
  const expectedTargets = labs.length + people.length - aliasedSourceRecords + canonicalPeople.length;

  assert.equal(canonicalPeople.length, 6);
  assert.equal(targets.length, expectedTargets);
  assert.ok(targets.length > 32, "researched candidate profiles should be included in enrichment targets");
  for (const identity of canonicalPeople) {
    const matches = targets.filter((target) => target.internalId === identity.id);
    assert.equal(matches.length, 1, `${identity.id} should occur once`);
    assert.deepEqual(matches[0].sourceRecordIds, {
      labs: identity.aliases.labs,
      people: identity.aliases.people
    });
  }
});

test("name-only matches never auto-confirm", () => {
  const target = {
    name: "Alex Smith",
    officialInstitution: "Example University",
    topicHints: ["optimization"],
    collaboratorHints: [],
    trackedPeerNames: []
  };
  const scored = scoreAuthorCandidate(target, {
    id: "https://openalex.org/A1",
    display_name: "Alex Smith",
    works_count: 100,
    cited_by_count: 5000
  });
  const decision = chooseAuthorCandidate([scored]);

  assert.equal(scored.score.name, 40);
  assert.deepEqual(scored.evidence.independentSignals, []);
  assert.equal(scored.autoConfirmEligible, false);
  assert.equal(decision.status, "needs_review");
  assert.equal(decision.selectedOpenAlexId, null);
  assert.match(decision.reason, /no independent/);
});

test("institution, collaborator, and topic evidence can confirm a searched author", () => {
  const target = {
    name: "Niao He",
    officialInstitution: "ETH Zurich",
    topicHints: ["reinforcement learning", "machine learning optimization"],
    collaboratorHints: [],
    trackedPeerNames: ["Stephen Boyd"]
  };
  const candidate = hydrateAuthorCandidate({
    id: "https://openalex.org/A123",
    display_name: "Niao He",
    last_known_institutions: [{ display_name: "Swiss Federal Institute of Technology Zurich" }],
    topics: [
      { display_name: "Reinforcement Learning", count: 10 },
      { display_name: "Optimization for Machine Learning", count: 8 }
    ],
    works_count: 40,
    cited_by_count: 2000
  }, [
    {
      authorships: [
        { author: { id: "https://openalex.org/A123", display_name: "Niao He" } },
        { author: { id: "https://openalex.org/A456", display_name: "Stephen Boyd" } }
      ],
      topics: [{ display_name: "Machine Learning Optimization", score: 0.9 }]
    }
  ]);
  const ranked = rankAuthorCandidates(target, [candidate]);
  const decision = chooseAuthorCandidate(ranked);

  assert.ok(ranked[0].score.institution >= 25);
  assert.ok(ranked[0].score.topic >= 10);
  assert.deepEqual(ranked[0].evidence.collaborators.trackedPeerMatches, [
    { expected: "Stephen Boyd", observed: "Stephen Boyd" }
  ]);
  assert.equal(decision.status, "auto_confirmed");
  assert.equal(decision.selectedOpenAlexId, "A123");
});

test("a narrow score margin remains unresolved", () => {
  const candidate = (id, total) => ({
    id: `https://openalex.org/${id}`,
    score: { total, name: 40, institution: 30, collaborator: 0, topic: total - 70 },
    evidence: { independentSignals: ["official_institution"] },
    autoConfirmEligible: true
  });
  const decision = chooseAuthorCandidate([
    candidate("A1", 90),
    candidate("A2", 86)
  ]);

  assert.equal(decision.status, "needs_review");
  assert.equal(decision.selectedOpenAlexId, null);
  assert.equal(decision.margin, 4);
  assert.match(decision.reason, /margin/);
});

test("career and recent-five-year metrics keep citation meanings separate", () => {
  const author = {
    id: "https://openalex.org/A1",
    works_count: 20,
    cited_by_count: 300,
    summary_stats: { h_index: 8, i10_index: 10, "2yr_mean_citedness": 2.5 },
    counts_by_year: [
      { year: 2026, works_count: 2, cited_by_count: 10 },
      { year: 2025, works_count: 1, cited_by_count: 8 },
      { year: 2024, works_count: 1, cited_by_count: 6 },
      { year: 2023, works_count: 0, cited_by_count: 4 },
      { year: 2022, works_count: 1, cited_by_count: 2 }
    ]
  };
  const works = [
    workFixture("W1", 2026, 12, "first", true),
    workFixture("W2", 2025, 7, "last", false),
    workFixture("W3", 2024, 3, "middle", false),
    workFixture("W4", 2022, 1, null, false),
    workFixture("W0", 2021, 100, "first", false)
  ];
  const metrics = buildAuthorMetrics(author, works, 2026);

  assert.equal(metrics.career.hIndex, 8);
  assert.equal(metrics.recentWorksCount, 5);
  assert.equal(metrics.recent5Years.fromYear, 2022);
  assert.equal(metrics.recent5Years.worksCount, 5);
  assert.equal(metrics.recent5Years.fetchedWorksCount, 4);
  assert.equal(metrics.recent5Years.citationsReceivedDuringWindow, 30);
  assert.equal(metrics.recent5Years.currentCitationsToWindowWorks, 23);
  assert.equal(metrics.recent5Years.hIndexForWindowWorks, 3);
  assert.equal(metrics.recent5Years.firstAuthorWorks, 1);
  assert.equal(metrics.recent5Years.correspondingAuthorWorks, 1);
  assert.equal(metrics.recent5Years.unknownAuthorshipRoleWorks, 1);
});

test("career highlights and recent works merge once with explicit selection reasons", () => {
  const careerHighlights = [
    workFixture("W1", 2010, 100, "first", true),
    workFixture("W2", 2025, 50, "last", false)
  ];
  const recentWorks = [
    workFixture("W2", 2025, 50, "last", false),
    workFixture("W3", 2026, 2, "first", false)
  ];
  const selected = mergeWorkSelections(careerHighlights, recentWorks);

  assert.equal(selected.length, 3);
  assert.equal(selected[0].selectionReason, "career_highlight");
  assert.deepEqual(selected[1].selectionReasons, ["career_highlight", "recent"]);
  assert.equal(selected[2].selectionReason, "recent");
});

test("concept trends aggregate topics by year without double-counting a work", () => {
  const works = [
    topicWork("W1", 2022, 3, ["Robust Optimization"]),
    topicWork("W2", 2025, 5, ["Robust Optimization", "Machine Learning"]),
    topicWork("W3", 2026, 7, ["Robust Optimization", "Robust Optimization"])
  ];
  const trends = buildConceptTrends(works, { fromYear: 2022, toYear: 2026 });
  const robust = trends.find((item) => item.displayName === "Robust Optimization");

  assert.equal(robust.worksCount, 3);
  assert.equal(robust.citedByCount, 15);
  assert.equal(robust.shareOfWorks, 1);
  assert.equal(robust.yearly.find((item) => item.year === 2026).worksCount, 1);
  assert.equal(robust.trend, "rising");
});

test("request URLs support API keys and polite mailto without putting them in cache keys", () => {
  const url = createOpenAlexUrl("/authors", { search: "Ada Lovelace", per_page: 5 }, {
    apiKey: "test-key",
    mailto: "radar@example.org"
  });
  assert.equal(url.searchParams.get("api_key"), "test-key");
  assert.equal(url.searchParams.get("mailto"), "radar@example.org");
  assert.equal(url.searchParams.get("search"), "Ada Lovelace");

  const cacheKey = buildOpenAlexCacheKey("/authors", {
    search: "Ada Lovelace",
    per_page: 5,
    api_key: "test-key",
    mailto: "radar@example.org"
  });
  const publicCacheKey = buildOpenAlexCacheKey("/authors", { search: "Ada Lovelace", per_page: 5 });
  assert.equal(cacheKey.length, 64);
  assert.equal(cacheKey, publicCacheKey);
  assert.equal(cacheKey.includes("test-key"), false);
});

test("retry delay honors Retry-After and the client retries HTTP 429", async () => {
  assert.equal(retryDelayMs(0, "2"), 2000);
  assert.equal(retryDelayMs(2, null, { baseDelayMs: 100, randomValue: 0 }), 400);

  let calls = 0;
  const sleeps = [];
  const client = new OpenAlexClient({
    maximumRetries: 1,
    minimumIntervalMs: 0,
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "1" })
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ id: "https://openalex.org/A1" })
      };
    }
  });

  const response = await client.getAuthor("A1");
  assert.equal(response.data.id, "https://openalex.org/A1");
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [1000]);
});

test("fresh cache entries avoid duplicate network requests", async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "openalex-cache-test-"));
  try {
    let calls = 0;
    const options = {
      cacheDir,
      minimumIntervalMs: 0,
      now: () => Date.parse("2026-07-10T00:00:00.000Z")
    };
    const first = new OpenAlexClient({
      ...options,
      fetchImpl: async () => {
        calls += 1;
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ id: "https://openalex.org/A1" })
        };
      }
    });
    await first.getAuthor("A1");

    const second = new OpenAlexClient({
      ...options,
      fetchImpl: async () => {
        throw new Error("network should not be called for a fresh cache hit");
      }
    });
    const cached = await second.getAuthor("A1");

    assert.equal(calls, 1);
    assert.equal(cached.fromCache, true);
    assert.equal(cached.stale, false);
  } finally {
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
});

test("failed atomic serialization leaves the previous output intact", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "openalex-output-test-"));
  const outputPath = path.join(directory, "openalex.json");
  try {
    await fs.writeFile(outputPath, "{\"version\":\"previous\"}\n", "utf8");
    const circular = {};
    circular.self = circular;
    await assert.rejects(writeJsonAtomically(outputPath, circular), /circular/i);
    assert.equal(await fs.readFile(outputPath, "utf8"), "{\"version\":\"previous\"}\n");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("only supported flags can select another output path or explicit-ID subset", () => {
  assert.deepEqual(parseOpenAlexArguments([]), { output: null, dryRun: true, explicitOnly: false, limit: null, help: false });
  assert.deepEqual(parseOpenAlexArguments(["--dry-run", "--explicit-only", "--limit", "3", "--output", "tmp/result.json"]), {
    output: "tmp/result.json",
    dryRun: true,
    explicitOnly: true,
    limit: 3,
    help: false
  });
  assert.equal(parseOpenAlexArguments(["--output=tmp/other.json"]).output, "tmp/other.json");
  assert.equal(parseOpenAlexArguments(["--limit=5"]).limit, 5);
  assert.equal(parseOpenAlexArguments(["--help"]).help, true);
  assert.throws(() => parseOpenAlexArguments(["tmp/result.json"]), /Unknown argument/);
  assert.throws(() => parseOpenAlexArguments(["--apply"]), /Unknown argument/);
});

test("CLI help never prints configured API key or private mailto values", () => {
  const apiKey = "private-openalex-key-for-test";
  const mailto = "private-mailto-for-test@example.org";
  const result = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "scripts", "enrich-academic-openalex.mjs"), "--help"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        OPENALEX_API_KEY: apiKey,
        OPENALEX_MAILTO: mailto
      }
    }
  );
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /OPENALEX_API_KEY/);
  assert.equal(output.includes(apiKey), false);
  assert.equal(output.includes(mailto), false);
});

function workFixture(id, year, citations, position, isCorresponding) {
  return {
    id: `https://openalex.org/${id}`,
    publication_year: year,
    cited_by_count: citations,
    authorships: [{
      author: { id: "https://openalex.org/A1", display_name: "Test Author" },
      author_position: position,
      is_corresponding: isCorresponding
    }]
  };
}

function topicWork(id, year, citations, topics) {
  return {
    id: `https://openalex.org/${id}`,
    publication_year: year,
    cited_by_count: citations,
    topics: topics.map((displayName, index) => ({
      id: `https://openalex.org/T${displayName === "Robust Optimization" ? 1 : index + 2}`,
      display_name: displayName,
      score: 0.9
    }))
  };
}
