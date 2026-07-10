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
});

test("people workspace exposes all six views and requested filters", () => {
  for (const label of ["总览", "导师课题组", "青年学者", "产业人物入口", "横向对比", "关系网络"]) {
    assert.ok(app.includes(label), `missing people tab: ${label}`);
  }
  for (const key of ["search", "type", "region", "research", "recruitment", "quality"]) {
    assert.match(app, new RegExp(`${key}: ""`));
  }
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
  assert.match(app, /new Blob\(\[JSON\.stringify/);
  assert.match(app, /academic-profile-\$\{safeFileName/);
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
