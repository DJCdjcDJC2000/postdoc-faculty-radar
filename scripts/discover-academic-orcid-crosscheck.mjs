import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAcademicTargets } from "./enrich-academic-openalex.mjs";
import { countPublicationTitleOverlaps, selectCrosscheckedOrcid } from "./lib/identifier-discovery.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(projectRoot, "data", "research", "academic-orcid-crosscheck-discoveries.json");
const searchDiscoveries = await readJson("data/research/academic-orcid-search-discoveries.json");
const { targets } = await loadAcademicTargets(projectRoot, { includeOrcidSearchDiscoveries: false });
const targetsById = new Map(targets.map((item) => [item.internalId, item]));
const queue = [...(searchDiscoveries.review ?? [])];
const checkedAt = new Date().toISOString();
const decisions = [];
const errors = [];
await Promise.all(Array.from({ length: 3 }, (_, index) => runWorker(index + 1)));

const profiles = decisions.filter((item) => item.status === "confirmed_candidate");
const review = decisions.filter((item) => item.status !== "confirmed_candidate");
await writeJsonAtomically(outputPath, {
  schemaVersion: "1.0.0",
  generatedAt: checkedAt,
  methodNoteZh: "将 ORCID 作品标题与已核验主页及其同域 publication/research 页面比对；至少两篇匹配且严格领先其他候选才确认。",
  thresholds: { minimumExactTitleMatches: 2, requiresUniqueLead: true },
  counts: { checked: decisions.length, candidates: profiles.length, review: review.length, errors: errors.length },
  profiles,
  review,
  errors
});
console.log(`ORCID title cross-check processed ${decisions.length}: ${profiles.length} candidates, ${review.length} review, ${errors.length} errors.`);

async function runWorker(workerId) {
  while (queue.length) {
    const searchDecision = queue.shift();
    if (!searchDecision) return;
    const target = targetsById.get(searchDecision.id);
    if (!target?.homepages?.length) {
      decisions.push({ id: searchDecision.id, name: searchDecision.name, status: "needs_review", reason: "missing_homepage" });
      continue;
    }
    try {
      const pageCorpus = await fetchHomepageCorpus(target.homepages);
      const candidateChecks = [];
      for (const candidate of (searchDecision.candidates ?? []).filter((item) => item.nameScore >= 0.94)) {
        const payload = await fetchJsonWithRetry(`https://pub.orcid.org/v3.0/${candidate.orcid}/record`);
        const titles = extractOrcidTitles(payload);
        candidateChecks.push({
          ...candidate,
          worksCount: titles.length,
          titleMatches: countPublicationTitleOverlaps(pageCorpus.text, titles)
        });
        await delay(180);
      }
      const selected = selectCrosscheckedOrcid(candidateChecks);
      decisions.push({
        id: searchDecision.id,
        name: searchDecision.name,
        officialInstitution: searchDecision.officialInstitution,
        checkedAt,
        status: selected.status,
        orcid: selected.orcid,
        selected: selected.selected,
        candidates: candidateChecks,
        sourceUrls: pageCorpus.urls,
        noteZh: selected.status === "confirmed_candidate"
          ? "ORCID 中至少两篇作品标题与已核验主页完全匹配，且候选领先唯一。"
          : "主页论文标题交叉证据不足，保留人工审核。"
      });
      console.log(`[worker ${workerId}] ${decisions.length}/${searchDiscoveries.review.length} ${searchDecision.name}: ${selected.status}`);
    } catch (error) {
      errors.push({ id: searchDecision.id, name: searchDecision.name, error: error.message });
      decisions.push({ id: searchDecision.id, name: searchDecision.name, status: "needs_review", reason: "crosscheck_fetch_failed" });
      console.warn(`[worker ${workerId}] ${searchDecision.name}: ${error.message}`);
    }
    await delay(250);
  }
}

async function fetchHomepageCorpus(homepages) {
  const firstUrl = homepages[0];
  const primary = await fetchTextWithRetry(firstUrl);
  const urls = [primary.url];
  const sameOriginLinks = extractPublicationLinks(primary.text, primary.url).slice(0, 2);
  const texts = [primary.text];
  for (const url of sameOriginLinks) {
    try {
      const page = await fetchTextWithRetry(url);
      texts.push(page.text);
      urls.push(page.url);
    } catch {
      // The primary homepage remains valid evidence when a linked page is unavailable.
    }
  }
  return { text: texts.join("\n"), urls: [...new Set(urls)] };
}

function extractPublicationLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const matches = [...String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const urls = [];
  for (const [, href, label] of matches) {
    if (!/(publication|paper|research|bibliograph|selected work)/i.test(`${href} ${label}`)) continue;
    try {
      const url = new URL(href, base);
      if (url.origin !== base.origin || /\.pdf(?:$|[?#])/i.test(url.href)) continue;
      urls.push(url.href);
    } catch {
      // Ignore malformed links from third-party templates.
    }
  }
  return [...new Set(urls)];
}

function extractOrcidTitles(payload) {
  return (payload["activities-summary"]?.works?.group ?? []).map((group) => (
    group["work-summary"]?.[0]?.title?.title?.value
  )).filter(Boolean);
}

async function fetchTextWithRetry(url) {
  const response = await fetchWithRetry(url, { Accept: "text/html,application/xhtml+xml" });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text") && !contentType.includes("html")) throw new Error(`unsupported content type: ${contentType}`);
  return { url: response.url, text: (await response.text()).slice(0, 4_000_000) };
}

async function fetchJsonWithRetry(url) {
  const response = await fetchWithRetry(url, { Accept: "application/json" });
  return response.json();
}

async function fetchWithRetry(url, headers) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        ...headers,
        "User-Agent": "postdoc-faculty-radar/0.1 (+https://github.com/DJCdjcDJC2000/postdoc-faculty-radar)"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000)
    });
    if (response.ok) return response;
    if (response.status !== 429 || attempt === 2) throw new Error(`HTTP ${response.status}`);
    await delay((attempt + 1) * 1_000);
  }
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(projectRoot, relativePath), "utf8"));
}

async function writeJsonAtomically(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
