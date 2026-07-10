import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(projectRoot, "data", "research", "academic-enrichment.json");
const document = JSON.parse(await fs.readFile(file, "utf8"));
let checked = 0;

for (const profile of document.profiles ?? []) {
  const orcid = normalizeOrcid(profile.author?.orcid);
  if (!orcid) continue;
  const [orcidWorks, crossref] = await Promise.all([
    requestJson(`https://pub.orcid.org/v3.0/${orcid}/works`, { Accept: "application/json" }),
    requestJson(`https://api.crossref.org/works?filter=orcid:${orcid}&rows=0`, {
      "User-Agent": "postdoc-faculty-radar/0.1 (https://github.com/DJCdjcDJC2000/postdoc-faculty-radar)"
    })
  ]);
  const checkedAt = new Date().toISOString();
  const orcidRecordCount = Number(orcidWorks.group?.length ?? 0);
  const crossrefWorksCount = Number(crossref.message?.["total-results"] ?? 0);
  profile.authorVerification = {
    status: "cross_source_checked",
    checkedAt,
    orcid: {
      id: orcid,
      url: `https://orcid.org/${orcid}`,
      recordCount: orcidRecordCount
    },
    crossref: {
      query: `orcid:${orcid}`,
      worksCount: crossrefWorksCount,
      url: `https://api.crossref.org/works?filter=orcid:${orcid}&rows=0`
    },
    warnings: buildWarnings(profile.metrics?.worksCount, orcidRecordCount, crossrefWorksCount)
  };
  checked += 1;
}

await writeJsonAtomically(file, document);
console.log(`Added ORCID and Crossref count checks to ${checked} academic profiles.`);

function buildWarnings(openAlexCount, orcidCount, crossrefCount) {
  const warnings = [
    "OpenAlex、ORCID 与 Crossref 的收录范围不同，三个数量不能直接当作同一口径的论文总数。",
    "OpenAlex 收录量可能包含会议论文、预印本、章节或同名合并记录；ORCID 与 Crossref 数量通常是下界。"
  ];
  const baseline = Math.max(orcidCount, crossrefCount, 1);
  if (Number(openAlexCount ?? 0) > baseline * 3) {
    warnings.push("OpenAlex 与 ORCID/Crossref 差异较大，使用总量前应进一步检查作者合并。" );
  }
  return warnings;
}

function normalizeOrcid(value) {
  return String(value ?? "").match(/\d{4}-\d{4}-\d{4}-[\dX]{4}/i)?.[0] ?? null;
}

async function requestJson(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Verification request failed with HTTP ${response.status}: ${url}`);
  return response.json();
}

async function writeJsonAtomically(target, value) {
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}
