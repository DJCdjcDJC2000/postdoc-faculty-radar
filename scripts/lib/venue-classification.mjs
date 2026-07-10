import fs from "node:fs";

const DEFAULT_TAXONOMY_URL = new URL("../../config/venue-taxonomy.json", import.meta.url);
const INDEX_CACHE = new WeakMap();
const MATCH_PRIORITY = {
  doi: 4,
  issn_l: 3,
  venue_id: 2,
  normalized_name: 1
};
const TIER_PRIORITY = {
  top_core: 3,
  important_mainstream: 2,
  related_reference: 1
};

export function loadVenueTaxonomy(file = DEFAULT_TAXONOMY_URL) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export const DEFAULT_VENUE_TAXONOMY = loadVenueTaxonomy();

export function normalizeDoi(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "")
    .replace(/[?#].*$/, "")
    .replace(/[\s.,;]+$/, "");
}

export function normalizeIssn(value) {
  const compact = String(value ?? "").trim().toUpperCase().replace(/[^0-9X]/g, "");
  return compact.length === 8 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
}

export function normalizeVenueName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/^proceedings\s+of\s+(?:the\s+)?/, "")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\b\d+(?:st|nd|rd|th)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeVenueId(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, "");
}

function asArray(value) {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value.flatMap(asArray) : [value];
}

function getPath(value, path) {
  return path.reduce((current, key) => current?.[key], value);
}

function valuesAtPaths(value, paths) {
  return paths.flatMap((path) => asArray(getPath(value, path)));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function venueIdKeys(value) {
  const normalized = normalizeVenueId(value);
  if (!normalized) return [];

  const keys = [normalized];
  const openAlexMatch = normalized.match(/(?:openalex\.org\/|openalex:)?(s\d+)$/);
  if (openAlexMatch) {
    keys.push(openAlexMatch[1], `openalex:${openAlexMatch[1]}`);
  }
  return unique(keys);
}

function addUniqueIndexValue(index, key, venue, kind) {
  if (!key) return;
  const existing = index.get(key);
  if (existing && existing.id !== venue.id) {
    throw new Error(`Ambiguous ${kind} '${key}' for ${existing.id} and ${venue.id}`);
  }
  index.set(key, venue);
}

function buildTaxonomyIndex(taxonomy) {
  if (INDEX_CACHE.has(taxonomy)) return INDEX_CACHE.get(taxonomy);

  const venueById = new Map();
  const venueByDoi = new Map();
  const venueByIssn = new Map();
  const venueByVenueId = new Map();
  const venueByName = new Map();
  const doiPrefixes = [];
  const assignmentsByVenue = new Map();

  for (const venue of taxonomy.venues ?? []) {
    if (!venue.id || venueById.has(venue.id)) {
      throw new Error(`Duplicate or missing venue id '${venue.id ?? ""}'`);
    }
    venueById.set(venue.id, venue);

    const identifiers = venue.identifiers ?? {};
    for (const doi of asArray(identifiers.dois)) {
      addUniqueIndexValue(venueByDoi, normalizeDoi(doi), venue, "DOI");
    }
    for (const prefix of asArray(identifiers.doiPrefixes)) {
      const normalized = normalizeDoi(prefix);
      if (normalized) doiPrefixes.push({ prefix: normalized, venue });
    }
    for (const issn of [identifiers.issnL, ...asArray(identifiers.issns)]) {
      addUniqueIndexValue(venueByIssn, normalizeIssn(issn), venue, "ISSN-L");
    }
    for (const id of [venue.id, ...asArray(identifiers.venueIds)]) {
      for (const key of venueIdKeys(id)) {
        addUniqueIndexValue(venueByVenueId, key, venue, "venue id");
      }
    }
    for (const name of [venue.name, venue.acronym, ...asArray(venue.aliases)]) {
      addUniqueIndexValue(venueByName, normalizeVenueName(name), venue, "venue name");
    }
  }

  const tierIds = taxonomy.tierIds ?? ["top_core", "important_mainstream", "related_reference"];
  for (const track of taxonomy.tracks ?? []) {
    for (const tier of tierIds) {
      const venueIds = track.tiers?.[tier];
      if (!Array.isArray(venueIds)) {
        throw new Error(`Track '${track.id}' is missing tier '${tier}'`);
      }
      for (const venueId of venueIds) {
        if (!venueById.has(venueId)) {
          throw new Error(`Track '${track.id}' references unknown venue '${venueId}'`);
        }
        const assignments = assignmentsByVenue.get(venueId) ?? [];
        if (assignments.some((item) => item.track === track.id)) {
          throw new Error(`Venue '${venueId}' appears more than once in track '${track.id}'`);
        }
        assignments.push({ track: track.id, tier });
        assignmentsByVenue.set(venueId, assignments);
      }
    }
  }

  doiPrefixes.sort((left, right) => right.prefix.length - left.prefix.length);
  const index = {
    venueByDoi,
    venueByIssn,
    venueByVenueId,
    venueByName,
    doiPrefixes,
    assignmentsByVenue
  };
  INDEX_CACHE.set(taxonomy, index);
  return index;
}

function sourceObjects(work) {
  return valuesAtPaths(work, [
    ["venue"],
    ["journal"],
    ["hostVenue"],
    ["host_venue"],
    ["source"],
    ["primaryLocation", "source"],
    ["primary_location", "source"],
    ["bestOaLocation", "source"],
    ["best_oa_location", "source"],
    ["locations"]
  ]).flatMap((value) => value?.source ? [value, value.source] : [value]);
}

function extractDois(work) {
  const values = valuesAtPaths(work, [
    ["doi"],
    ["DOI"],
    ["ids", "doi"],
    ["ids", "DOI"],
    ["externalIds", "doi"],
    ["externalIds", "DOI"],
    ["external_ids", "doi"]
  ]);
  return unique(values.map(normalizeDoi));
}

function extractIssns(work) {
  const direct = valuesAtPaths(work, [
    ["issnL"],
    ["issn_l"],
    ["issn-l"],
    ["issn"],
    ["ISSN"]
  ]);
  const nested = sourceObjects(work).flatMap((source) => {
    if (!source || typeof source !== "object") return [];
    return asArray(source.issn_l ?? source.issnL).concat(asArray(source.issn ?? source.ISSN));
  });
  return unique([...direct, ...nested].map(normalizeIssn));
}

function extractVenueIds(work) {
  const direct = valuesAtPaths(work, [
    ["venueId"],
    ["venue_id"],
    ["sourceId"],
    ["source_id"],
    ["journalId"],
    ["journal_id"]
  ]);
  const nested = sourceObjects(work).flatMap((source) => {
    if (!source || typeof source !== "object") return [];
    return asArray(source.id ?? source.venueId ?? source.venue_id);
  });
  return unique([...direct, ...nested].flatMap(venueIdKeys));
}

function extractVenueNames(work) {
  const direct = valuesAtPaths(work, [
    ["venueName"],
    ["venue_name"],
    ["journal"],
    ["containerTitle"],
    ["container_title"],
    ["container-title"],
    ["event"],
    ["conference"]
  ]);
  const nested = sourceObjects(work).flatMap((source) => {
    if (typeof source === "string") return [source];
    if (!source || typeof source !== "object") return [];
    return asArray(source.display_name ?? source.displayName ?? source.name ?? source.title);
  });
  return unique([...direct, ...nested].map((value) => String(value).trim()).filter(Boolean));
}

function matchVenue(work, index) {
  for (const doi of extractDois(work)) {
    const exact = index.venueByDoi.get(doi);
    if (exact) return { venue: exact, matchedBy: "doi", matchValue: doi, matchType: "exact" };
    const prefix = index.doiPrefixes.find((item) => doi.startsWith(item.prefix));
    if (prefix) {
      return { venue: prefix.venue, matchedBy: "doi", matchValue: doi, matchType: "prefix" };
    }
  }

  for (const issn of extractIssns(work)) {
    const venue = index.venueByIssn.get(issn);
    if (venue) return { venue, matchedBy: "issn_l", matchValue: issn, matchType: "exact" };
  }

  for (const id of extractVenueIds(work)) {
    const venue = index.venueByVenueId.get(id);
    if (venue) return { venue, matchedBy: "venue_id", matchValue: id, matchType: "exact" };
  }

  for (const name of extractVenueNames(work)) {
    const normalized = normalizeVenueName(name);
    const venue = index.venueByName.get(normalized);
    if (venue) {
      return { venue, matchedBy: "normalized_name", matchValue: normalized, matchType: "exact" };
    }
  }

  return null;
}

function normalizePublicationClass(value) {
  const normalized = normalizeVenueName(value);
  if (["archival", "archival publication", "published", "peer reviewed publication"].includes(normalized)) {
    return "archival_publication";
  }
  if (["preprint", "working paper"].includes(normalized)) return "preprint";
  if (["nonarchival event", "non archival event", "event"].includes(normalized)) {
    return "nonarchival_event";
  }
  return null;
}

export function determinePublicationClass(work, matchedVenue = null) {
  if (work?.isPreprint === true || work?.is_preprint === true) return "preprint";

  const explicit = valuesAtPaths(work, [
    ["publicationClass"],
    ["publication_class"],
    ["archivalStatus"],
    ["archival_status"]
  ]).map(normalizePublicationClass).find(Boolean);
  if (explicit) return explicit;

  if (work?.isArchival === false || work?.is_archival === false || work?.archival === false) {
    return "nonarchival_event";
  }
  if (work?.isArchival === true || work?.is_archival === true || work?.archival === true) {
    return "archival_publication";
  }

  const typeText = valuesAtPaths(work, [
    ["publicationType"],
    ["publication_type"],
    ["workType"],
    ["work_type"],
    ["itemType"],
    ["item_type"],
    ["type"],
    ["subtype"]
  ]).map((value) => normalizeVenueName(value)).join(" ");

  if (/\b(?:preprint|working paper|submitted manuscript|arxiv)\b/.test(typeText)) return "preprint";
  if (/\b(?:journal article|proceedings article|conference paper|book chapter)\b/.test(typeText)) {
    return "archival_publication";
  }
  if (/\b(?:event|conference|talk|keynote|presentation|poster|tutorial|panel|seminar|webinar|meeting|workshop)\b/.test(typeText)) {
    return "nonarchival_event";
  }
  if (/\b(?:article|paper|journal)\b/.test(typeText)) return "archival_publication";
  return matchedVenue?.publicationClass ?? "unknown";
}

export function classifyVenue(input, taxonomy = DEFAULT_VENUE_TAXONOMY) {
  const work = typeof input === "string" ? { venueName: input } : (input ?? {});
  const index = buildTaxonomyIndex(taxonomy);
  const match = matchVenue(work, index);
  const venue = match?.venue ?? null;
  const assignments = venue ? (index.assignmentsByVenue.get(venue.id) ?? []) : [];
  const publicationClass = determinePublicationClass(work, venue);
  const countedClass = taxonomy.publicationPolicy?.countedClass ?? "archival_publication";
  const counted = Boolean(venue && assignments.length && publicationClass === countedClass);
  const fallbackVenueName = extractVenueNames(work)[0] ?? null;

  let exclusionReason = null;
  if (publicationClass === "preprint") exclusionReason = "preprint";
  else if (publicationClass === "nonarchival_event") exclusionReason = "nonarchival_event";
  else if (!venue) exclusionReason = "unclassified_venue";
  else if (!assignments.length) exclusionReason = "venue_outside_tracks";
  else if (publicationClass !== countedClass) exclusionReason = "nonarchival_publication";

  return {
    venueId: venue?.id ?? null,
    venueName: venue?.name ?? fallbackVenueName,
    venueType: venue?.venueType ?? null,
    publicationClass,
    archival: publicationClass === "archival_publication",
    counted,
    count: counted ? 1 : 0,
    exclusionReason,
    matchedBy: match?.matchedBy ?? null,
    matchType: match?.matchType ?? null,
    matchValue: match?.matchValue ?? null,
    tracks: unique(assignments.map((item) => item.track)),
    tiers: Object.fromEntries(assignments.map((item) => [item.track, item.tier])),
    matches: assignments.map((item) => ({ ...item })),
    sourceUrls: venue?.sourceUrls ? [...venue.sourceUrls] : []
  };
}

export function classifyPublication(input, taxonomy = DEFAULT_VENUE_TAXONOMY) {
  return classifyVenue(input, taxonomy);
}

export function classifyWork(input, taxonomy = DEFAULT_VENUE_TAXONOMY) {
  return classifyVenue(input, taxonomy);
}

function normalizeWorkTitle(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function explicitFamilyValue(work) {
  const value = work?.work_family ?? work?.workFamily ?? work?.work_family_id ?? work?.workFamilyId;
  if (value && typeof value === "object") return value.id ?? value.key ?? value.name ?? null;
  return value;
}

export function getWorkFamilyKey(work, index = 0) {
  const family = explicitFamilyValue(work);
  if (family !== undefined && family !== null && String(family).trim()) {
    return `family:${String(family).trim().toLowerCase()}`;
  }

  const doi = extractDois(work)[0];
  if (doi) return `doi:${doi}`;

  const id = work?.id ?? work?.workId ?? work?.work_id;
  if (id !== undefined && id !== null && String(id).trim()) {
    return `work:${String(id).trim().toLowerCase()}`;
  }

  const title = normalizeWorkTitle(work?.title ?? work?.display_name ?? work?.displayName);
  if (title) return `title:${title}`;
  return `input:${index}`;
}

function representativeScore(classification) {
  const publicationScore = classification.counted
    ? 100
    : classification.publicationClass === "archival_publication"
      ? 60
      : classification.venueId
        ? 20
        : 0;
  const matchScore = MATCH_PRIORITY[classification.matchedBy] ?? 0;
  const tierScore = Math.max(0, ...classification.matches.map((item) => TIER_PRIORITY[item.tier] ?? 0));
  return publicationScore + matchScore + tierScore;
}

function selectFamilyRepresentative(records, taxonomy) {
  return records
    .map(({ work, inputIndex }) => ({ work, inputIndex, result: classifyVenue(work, taxonomy) }))
    .sort((left, right) => {
      return representativeScore(right.result) - representativeScore(left.result)
        || left.inputIndex - right.inputIndex;
    })[0];
}

export function summarizeVenueClassifications(classifications, taxonomy = DEFAULT_VENUE_TAXONOMY) {
  const tierIds = taxonomy.tierIds ?? ["top_core", "important_mainstream", "related_reference"];
  const byTrack = Object.fromEntries((taxonomy.tracks ?? []).map((track) => [track.id, 0]));
  const byTier = Object.fromEntries(tierIds.map((tier) => [tier, 0]));
  const byTrackAndTier = Object.fromEntries((taxonomy.tracks ?? []).map((track) => [
    track.id,
    Object.fromEntries(tierIds.map((tier) => [tier, 0]))
  ]));

  for (const classification of classifications) {
    if (!classification.counted) continue;
    const seen = new Set();
    for (const match of classification.matches ?? []) {
      const key = `${match.track}:${match.tier}`;
      if (seen.has(key) || !(match.track in byTrackAndTier) || !(match.tier in byTier)) continue;
      seen.add(key);
      byTrack[match.track] += 1;
      byTier[match.tier] += 1;
      byTrackAndTier[match.track][match.tier] += 1;
    }
  }

  const venueBreakdown = (taxonomy.tracks ?? []).flatMap((track) => tierIds.map((tier) => ({
    track: track.id,
    tier,
    count: byTrackAndTier[track.id][tier]
  })));
  const global = classifications.filter((item) => item.counted).length;
  const archivalPublications = classifications.filter((item) => item.publicationClass === "archival_publication").length;
  const excluded = classifications.filter((item) => ["preprint", "nonarchival_event"].includes(item.publicationClass)).length;
  const unclassified = classifications.filter((item) => !item.venueId).length;

  return {
    totalCount: global,
    globalCount: global,
    excludedCount: excluded,
    unclassifiedCount: unclassified,
    venueBreakdown,
    counts: {
      global,
      archivalPublications,
      excluded,
      unclassified,
      byTrack,
      byTier,
      byTrackAndTier
    }
  };
}

export function classifyWorks(works, taxonomy = DEFAULT_VENUE_TAXONOMY) {
  const inputWorks = Array.isArray(works) ? works : [];
  const families = new Map();

  inputWorks.forEach((work, inputIndex) => {
    const workFamily = getWorkFamilyKey(work, inputIndex);
    const records = families.get(workFamily) ?? [];
    records.push({ work, inputIndex });
    families.set(workFamily, records);
  });

  const classifications = [...families.entries()].map(([workFamily, records]) => {
    const representative = selectFamilyRepresentative(records, taxonomy);
    return {
      ...representative.result,
      workFamily,
      inputIndex: representative.inputIndex,
      sourceWorkCount: records.length,
      duplicateCount: records.length - 1
    };
  });
  const summary = summarizeVenueClassifications(classifications, taxonomy);

  return {
    inputCount: inputWorks.length,
    familyCount: classifications.length,
    deduplicatedCount: inputWorks.length - classifications.length,
    works: classifications,
    classifications,
    ...summary
  };
}

export function classifyPublications(works, taxonomy = DEFAULT_VENUE_TAXONOMY) {
  return classifyWorks(works, taxonomy);
}

export function buildVenueBreakdown(worksOrClassifications, taxonomy = DEFAULT_VENUE_TAXONOMY) {
  const values = Array.isArray(worksOrClassifications) ? worksOrClassifications : [];
  const alreadyClassified = values.every((item) => Array.isArray(item?.matches) && "publicationClass" in item);
  return alreadyClassified
    ? summarizeVenueClassifications(values, taxonomy).venueBreakdown
    : classifyWorks(values, taxonomy).venueBreakdown;
}
