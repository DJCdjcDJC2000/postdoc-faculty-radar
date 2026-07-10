import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const projectRoot = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");
const app = read("src/site/app.js");
const html = read("src/site/index.html");
const css = read("src/site/styles.css");
const copy = JSON.parse(read("config/site-copy.json"));

test("academic people has a first-level route while success cases remain available", () => {
  const navigation = new Map(copy.navigation.map((item) => [item.id, item.label]));
  assert.equal(navigation.get("people"), "学术人物");
  assert.equal(navigation.get("cases"), "成功案例");
  assert.match(html, /id="page-people"/);
  assert.match(html, /id="page-profile"/);
  assert.match(html, /id="page-cases"/);
});

test("people UI reads schema 2 academic profiles and supports restorable profile hashes", () => {
  assert.match(app, /state\.data\.academic/);
  assert.match(app, /schemaVersion\) !== 2/);
  assert.match(app, /profileId: decodeURIComponent/);
  assert.match(app, /href="#people\/\$\{encodeURIComponent\(profile\.id\)\}"/);
  assert.match(app, /safeView === "profile"/);
  assert.match(app, /renderAcademicProfile\(\)/);
  assert.match(app, /behavior: "instant"/);
  assert.match(app, /requestAnimationFrame\(scrollToTop\)/);
});

test("people workspace exposes all six views and requested filters", () => {
  for (const label of ["总览", "导师课题组", "青年学者", "产业人物入口", "横向对比", "关系网络"]) {
    assert.ok(app.includes(label), `missing people tab: ${label}`);
  }
  for (const key of ["search", "type", "region", "research", "recruitment", "quality", "qs", "method", "application", "topVenues", "activity", "grants", "evidence", "updated", "sort"]) {
    assert.match(app, new RegExp(`${key}: ""`));
  }
  for (const label of ["高级人物筛选", "QS 区间", "研究方法", "应用方向", "核心顶刊保守下限", "近五年活跃度", "基金奖项", "证据可信度", "更新时间", "排序", "保存筛选", "载入筛选"]) {
    assert.ok(app.includes(label), `missing advanced filter: ${label}`);
  }
  assert.match(app, /PEOPLE_FILTER_STORAGE_KEY/);
  assert.match(app, /academicTopVenueCount/);
  assert.match(app, /peopleNaturalQuery/);
  assert.match(app, /academicNaturalQueryMatches/);
  assert.match(app, /群体特征总览/);
  assert.match(app, /peopleView: "table"/);
  assert.match(app, /state\.peopleCompare\.size >= 5/);
  assert.match(app, /最多选择 5 人/);
});

test("profile page covers research, publication, group and evidence records", () => {
  for (const heading of [
    "论文指标",
    "近 5 年研究变化",
    "分赛道 Venue 分布",
    "代表作",
    "学术时间线",
    "基金与奖项",
    "课题组",
    "招聘与扩组信号",
    "证据与更新时间"
  ]) {
    assert.ok(app.includes(heading), `missing profile section: ${heading}`);
  }
  assert.match(app, /profile\.profileType === "mentor_group" \? 8 : 5/);
  assert.match(app, /window\.print\(\)/);
  assert.match(app, /JSON\.stringify\(payload, null, 2\)/);
  assert.match(app, /academic-profile-\$\{safeFileName/);
  assert.match(app, /isTopicMetric/);
  assert.match(app, /近 5 年 \$\{worksCount\} 篇相关公开记录/);
  for (const label of ["研究方法", "应用方向", "入选理由", "JSON", "Markdown", "CSV", "BibTeX", "PNG"]) {
    assert.ok(app.includes(label), `missing profile intelligence or export label: ${label}`);
  }
  assert.match(app, /近五年且可回溯，用于观察近期研究主线/);
  assert.match(app, /来自已核验公开成果清单，用于核对研究主题与职业阶段/);
  assert.match(app, /exportAcademicComparison/);
  assert.match(app, /exportAcademicNetwork/);
});

test("academic comparison suppresses zero-count venues and localizes taxonomy labels", () => {
  assert.match(app, /\.filter\(\(item\) => Number\(item\?\.count \?\? 0\) > 0\)/);
  assert.match(app, /VENUE_TIER_ORDER/);
  assert.match(app, /venueTierLabel\(item\.tier\)/);
  assert.match(app, /venueTaxonomy\?\.tracks/);
});

test("all seven recruitment signals are present and visually distinct", () => {
  const expected = new Map([
    ["official_opening", "signal-official"],
    ["funded_expansion_signal", "signal-funded"],
    ["accepts_applications", "signal-accepts"],
    ["fellowship_host", "signal-fellowship"],
    ["department_opening", "signal-department"],
    ["no_public_signal", "signal-none"],
    ["closed_or_expired", "signal-closed"]
  ]);
  for (const [type, className] of expected) {
    assert.ok(app.includes(type), `missing recruitment type: ${type}`);
    assert.ok(app.includes(className), `missing signal class: ${className}`);
    assert.match(css, new RegExp(`\\.${className}\\s*\\{`));
  }
  assert.match(app, /扩组线索，不等于公开招聘/);
  assert.match(app, /长期申请通道，不等于公开招聘/);
  assert.match(app, /需经 Fellowship 项目申请/);
});

test("academic profile typography, responsive cards and print layout are defined", () => {
  assert.match(css, /\.profile-document\s*\{[^}]*font-family:\s*"Times New Roman", KaiTi, "STKaiti", serif/s);
  assert.match(css, /\.profile-actions[\s\S]*font-family:\s*Aptos/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.people-table-wrap\s*\{\s*display:\s*none;/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.people-mobile-list\s*\{\s*display:\s*grid;/);
  assert.match(css, /@media print/);
  assert.doesNotMatch(html, /https?:\/\/[^"']+(?:\.js|\.css)/);
});

test("new public academic surfaces do not render user-specific analysis", () => {
  const peopleStart = app.indexOf("function renderPeople()");
  const peopleEnd = app.indexOf("function renderCases()", peopleStart);
  const profileStart = app.indexOf("function renderAcademicProfile()");
  const profileEnd = app.indexOf("function showIndustryOpportunityDetail", profileStart);
  const academicUi = `${app.slice(peopleStart, peopleEnd)}\n${app.slice(profileStart, profileEnd)}`;
  for (const forbidden of ["我的匹配", "个人差距", "申请概率", "行动建议", "私人备注", "帮助我"]) {
    assert.equal(academicUi.includes(forbidden), false, `public academic UI includes: ${forbidden}`);
  }
});
