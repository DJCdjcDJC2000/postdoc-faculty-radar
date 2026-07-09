import crypto from "node:crypto";

export function normalizeWhitespace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

export function normalizeUrl(value, base) {
  try {
    const url = new URL(value, base);
    url.hash = "";
    const removable = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid"
    ];
    for (const key of removable) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function stableId(parts) {
  const value = Array.isArray(parts) ? parts.join("|") : String(parts);
  return crypto.createHash("sha1").update(value.toLowerCase()).digest("hex").slice(0, 16);
}

export function dedupeJobs(jobs) {
  const seen = new Map();
  for (const job of jobs) {
    const urlKey = job.sourceUrl ? normalizeUrl(job.sourceUrl) : "";
    const fallbackKey = [
      normalizeWhitespace(job.title).toLowerCase(),
      normalizeWhitespace(job.institution).toLowerCase(),
      normalizeWhitespace(job.region).toLowerCase()
    ].join("|");
    const key = urlKey || fallbackKey;
    const previous = seen.get(key);
    if (!previous || (job.matchScore ?? 0) > (previous.matchScore ?? 0)) {
      seen.set(key, job);
    }
  }
  return [...seen.values()];
}

export function extractDate(text) {
  const value = normalizeWhitespace(text);
  const iso = value.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const dmy = value.match(/\b(0?[1-9]|[12]\d|3[01])\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(20\d{2})\b/i);
  if (dmy) {
    const [, day, monthName, year] = dmy;
    return `${year}-${monthNumber(monthName)}-${day.padStart(2, "0")}`;
  }

  const mdy = value.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(0?[1-9]|[12]\d|3[01]),?\s+(20\d{2})\b/i);
  if (mdy) {
    const [, monthName, day, year] = mdy;
    return `${year}-${monthNumber(monthName)}-${day.padStart(2, "0")}`;
  }

  return null;
}

function monthNumber(value) {
  const key = value.slice(0, 3).toLowerCase();
  const months = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12"
  };
  return months[key] ?? "01";
}

export function compareByPriorityThenDate(a, b) {
  const scoreDelta = (b.matchScore ?? 0) - (a.matchScore ?? 0);
  if (scoreDelta !== 0) return scoreDelta;
  const aDate = a.deadline || "9999-12-31";
  const bDate = b.deadline || "9999-12-31";
  return aDate.localeCompare(bDate);
}
