const schools = {
  HKU: "香港大学",
  CUHK: "香港中文大学",
  HKUST: "香港科技大学",
  CityU: "香港城市大学",
  PolyU: "香港理工大学",
};
const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
const state = {
  school: "",
  topic: "",
  stage: "",
  query: "",
  sort: "recommended",
  page: 1,
  favoritesOnly: false,
};
const pageSize = 12;
const compare = new Set();
let data;
let favorites = new Set();
let toastTimer;
try {
  const saved = JSON.parse(
    localStorage.getItem("faculty-atlas-favorites") || "[]",
  );
  if (Array.isArray(saved))
    favorites = new Set(saved.filter((id) => typeof id === "string"));
} catch {
  /* Browser storage may be unavailable. The page remains usable. */
}

const journeys = {
  europe: {
    id: "P002",
    caption: "香港博士 · 奥地利研究经历 · 回港任职",
    stops: [
      ["2020", "香港浸会大学", "数学博士 · Hongyu Liu"],
      ["2020—2023", "Johann Radon Institute", "奥地利研究岗位 · Mourad Sini"],
      ["2023 → 2024", "香港理工大学", "RAP → Assistant Professor"],
    ],
  },
  local: {
    id: "P004",
    caption: "香港本地博后 · 研究岗位 · 助理教授",
    stops: [
      ["2021", "清华大学", "数学博士 · Chunxiong Zheng"],
      ["2021—2026", "香港理工大学", "博后 → RAP · Buyang Li"],
      ["2026.05", "香港理工大学", "Assistant Professor"],
    ],
  },
  direct: {
    id: "P001",
    caption: "博士毕业后直接进入香港教职",
    stops: [
      ["2019", "香港大学", "数学本科"],
      ["2019—2024", "Columbia University", "运筹学博士 · Cédric Josz"],
      ["2024.07", "香港大学", "Assistant Professor"],
    ],
  },
};

function stageOf(person) {
  return (
    {
      窗口内: "recent",
      资深引进: "senior",
      窗口外对照: "historical",
      "2020 边界": "historical",
      研究岗位: "research",
      已离港: "departed",
      待核日期: "pending",
    }[person.category] || "pending"
  );
}

function stageLabel(person) {
  return {
    recent: "近期入职与流动",
    senior: "资深引进",
    historical: "历史与边界对照",
    research: "研究岗位",
    departed: "已离港",
    pending: "入职日期待核",
  }[stageOf(person)];
}

function shortRole(person) {
  if (person.category === "已离港") return "原 CityU AP · 现 NTU AP";
  if (/冲突/.test(person.role)) return person.role;
  if (/Research Assistant/.test(person.role))
    return "Research Assistant Professor";
  if (/Chair Professor/.test(person.role)) return "Chair Professor";
  if (/Associate Professor/.test(person.role)) return "Associate Professor";
  if (/Assistant Professor/.test(person.role)) return "Assistant Professor";
  return person.role;
}

function notify(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 2600);
}

function safeSource(url) {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

function sourcesHtml(person) {
  return person.sources
    .map((url, index) => {
      const parsed = safeSource(url);
      if (!parsed) return "";
      return `<a class="source-link" href="${esc(parsed.href)}" target="_blank" rel="noopener noreferrer"><strong>${String(index + 1).padStart(2, "0")} · ${esc(parsed.hostname)} ↗</strong><span>${esc(parsed.href)}</span></a>`;
    })
    .join("");
}

function toggleFavorite(id) {
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  try {
    localStorage.setItem(
      "faculty-atlas-favorites",
      JSON.stringify([...favorites]),
    );
  } catch {
    notify("当前浏览器无法保存收藏，本次页面内仍可使用。");
  }
  renderPeople();
  document.querySelectorAll(`[data-favorite="${id}"]`).forEach((button) => {
    button.setAttribute("aria-pressed", String(favorites.has(id)));
    button.textContent = button.classList.contains("bookmark-button")
      ? favorites.has(id)
        ? "★"
        : "☆"
      : favorites.has(id)
        ? "★ 已收藏"
        : "☆ 收藏档案";
    button.setAttribute(
      "aria-label",
      favorites.has(id) ? "取消收藏" : "收藏档案",
    );
  });
}

function renderJourney(key) {
  const journey = journeys[key];
  const person = data.people.find((p) => p.id === journey.id);
  $("#featured-journey").innerHTML =
    `<div class="featured-heading initial-reveal"><div><h3>${esc(person.zhName || person.name)} <span lang="en">${person.zhName ? esc(person.name) : ""}</span></h3><p>${esc(journey.caption)}</p></div><button class="featured-open" data-open="${person.id}" aria-label="阅读${esc(person.name)}的档案">↗</button></div><div class="journey-stops initial-reveal">${journey.stops.map(([year, place, role]) => `<div class="journey-stop"><time>${esc(year)}</time><div><strong>${esc(place)}</strong><small>${esc(role)}</small></div></div>`).join("")}</div>`;
  document.querySelectorAll("[data-journey]").forEach((button) => {
    button.setAttribute(
      "aria-selected",
      String(button.dataset.journey === key),
    );
    button.tabIndex = button.dataset.journey === key ? 0 : -1;
  });
}

function renderSchoolControls() {
  const counts = Object.fromEntries(
    Object.keys(schools).map((key) => [
      key,
      data.people.filter((p) => p.school === key).length,
    ]),
  );
  const max = Math.max(...Object.values(counts));
  $("#school-tabs").innerHTML =
    `<button data-school="" aria-pressed="${state.school === ""}">全部院校 <small>${data.people.length}</small></button>` +
    Object.entries(schools)
      .map(
        ([key]) =>
          `<button data-school="${key}" aria-pressed="${state.school === key}">${key}<small>${counts[key]}</small></button>`,
      )
      .join("");
  $("#school-chart").innerHTML = Object.entries(schools)
    .map(
      ([key, label]) =>
        `<button class="school-chart-row ${state.school === key ? "active" : ""}" data-school="${key}" aria-label="筛选${esc(label)}，${counts[key]}份档案"><span>${key}<strong>${counts[key]}</strong></span><div class="track"><span class="fill" style="width:${(counts[key] / max) * 100}%"></span></div></button>`,
    )
    .join("");
}

function personCard(person) {
  const selected = compare.has(person.id);
  const favorite = favorites.has(person.id);
  return `<article class="person-card"><div class="card-top"><span class="school-chip" data-school="${person.school}">${person.school}</span><button class="bookmark-button" data-favorite="${person.id}" aria-pressed="${favorite}" aria-label="${favorite ? "取消收藏" : "收藏"}${esc(person.name)}">${favorite ? "★" : "☆"}</button></div><h3 class="person-name"><button data-open="${person.id}">${esc(person.name)}</button></h3><p class="person-zh">${esc(person.zhName)}${person.name === "Rong Tang" ? ` · ${person.school}` : ""}</p><p class="person-role">${esc(shortRole(person))}</p><div class="card-topics">${person.topics
    .slice(0, 2)
    .map((topic) => `<span class="topic-tag">${esc(topic)}</span>`)
    .join(
      "",
    )}</div><p class="person-summary">${esc(person.relevance)}</p><div class="card-facts"><span class="tiny-dot"></span><span>${esc(person.joined)}</span></div><div class="card-bottom"><button class="compare-pick" data-compare="${person.id}" aria-pressed="${selected}" aria-label="${selected ? "移除" : "比较"}${esc(person.name)}">${selected ? "已加入" : "对比"}</button><button class="card-open" data-open="${person.id}">阅读档案 <span aria-hidden="true">↗</span></button></div></article>`;
}

function filteredPeople() {
  const query = state.query.toLocaleLowerCase().trim();
  return data.people
    .filter((person) => {
      if (state.school && person.school !== state.school) return false;
      if (state.topic && !person.topics.includes(state.topic)) return false;
      if (state.stage && stageOf(person) !== state.stage) return false;
      if (state.favoritesOnly && !favorites.has(person.id)) return false;
      if (!query) return true;
      return [
        person.name,
        person.zhName,
        person.education,
        person.career,
        person.connections,
        person.relevance,
        person.topics.join(" "),
        JSON.stringify(person.papers),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      if (state.sort === "name") return a.name.localeCompare(b.name);
      if (state.sort === "papers")
        return (
          b.papers.length - a.papers.length || a.name.localeCompare(b.name)
        );
      return Number(a.id.slice(1)) - Number(b.id.slice(1));
    });
}

function renderPeople() {
  const people = filteredPeople();
  const pages = Math.max(1, Math.ceil(people.length / pageSize));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * pageSize;
  $("#people-grid").setAttribute("aria-busy", "false");
  $("#people-grid").innerHTML = people.length
    ? people
        .slice(start, start + pageSize)
        .map(personCard)
        .join("")
    : `<div class="empty-state"><h3>${state.favoritesOnly ? "这里等待你的第一份收藏" : "还没有匹配的档案"}</h3><p>${state.favoritesOnly ? "点击人物卡片上的星标，把感兴趣的研究路径放在一起。" : "试试更短的姓名、导师姓氏，或放宽筛选条件。"}</p><button data-reset>浏览全部人物 ↗</button></div>`;
  $("#results-count").innerHTML =
    `共 <strong>${people.length}</strong> 份档案${people.length ? ` <span>· 正在显示 ${start + 1}—${Math.min(start + pageSize, people.length)}</span>` : ""}`;
  $("#favorite-count").textContent = favorites.size;
  $("#favorite-filter").setAttribute(
    "aria-pressed",
    String(state.favoritesOnly),
  );
  $("#pagination").innerHTML =
    pages > 1
      ? `<button data-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""} aria-label="上一页">←</button>${Array.from({ length: pages }, (_, i) => `<button data-page="${i + 1}" ${i + 1 === state.page ? 'aria-current="page"' : ""} aria-label="第${i + 1}页">${i + 1}</button>`).join("")}<button data-page="${state.page + 1}" ${state.page === pages ? "disabled" : ""} aria-label="下一页">→</button>`
      : "";
  renderSchoolControls();
}

function setSchool(school) {
  state.school = school;
  state.page = 1;
  renderPeople();
}

function resetFilters() {
  Object.assign(state, {
    school: "",
    topic: "",
    stage: "",
    query: "",
    sort: "recommended",
    page: 1,
    favoritesOnly: false,
  });
  $("#search").value = "";
  $("#topic-filter").value = "";
  $("#stage-filter").value = "";
  $("#sort").value = "recommended";
  renderPeople();
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (!dialog.open) dialog.showModal();
  document.body.classList.add("dialog-open");
}

function closeDialog(id) {
  document.getElementById(id).close();
}

function evidenceLinks(urls, label = "依据") {
  return [...new Set(urls || [])]
    .map(safeSource)
    .filter(Boolean)
    .map((source, index) => `<a href="${esc(source.href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ${index + 1} ↗</a>`)
    .join(" ");
}

function venueContext(venue) {
  let normalized = venue;
  for (const [alias, name] of Object.entries(data.venueAliases || {})) {
    normalized = normalized.replace(alias, name);
  }
  if (/Preprint|预印本|arXiv|最终卷页/i.test(normalized)) {
    return { judgment: "本条的预印本或正式出版状态需按书目说明核对。", sources: [] };
  }
  return [...(data.venueGuide || [])]
    .sort((a, b) => b.name.length - a.name.length)
    .find((guide) => normalized.toLowerCase().startsWith(guide.name.toLowerCase()));
}

function assessmentHtml(person, compact = false) {
  const assessment = person.assessment;
  if (!assessment) return "";
  if (compact) {
    return `<h4>训练与平台作用</h4><p>${esc(assessment.training)}</p><h4>获聘竞争力 · 研究判断</h4><p>${esc(assessment.competition)}</p><h4>你可以借鉴</h4><p>${esc(assessment.lesson)}</p>`;
  }
  const mentors = assessment.mentorIds
    .map((id) => data.mentors[id])
    .filter(Boolean)
    .map((mentor) => `<article class="mentor-card"><h4>${esc(mentor.name)}</h4><p class="mentor-standing">${esc(mentor.standing)}</p><p>${esc(mentor.field)}</p><p>${esc(mentor.contribution)}</p><div class="assessment-sources">${evidenceLinks(mentor.sources, "学者来源")}</div></article>`)
    .join("");
  const timeline = (assessment.timeline || [])
    .map(([date, detail]) => `<li><time>${esc(date)}</time><p>${esc(detail)}</p></li>`)
    .join("");
  return `<section class="profile-section assessment-intro"><p class="assessment-kicker">人物解读 · ${esc(assessment.basis)}</p><h3>从这份经历中能学到什么</h3><div class="assessment-grid"><article><h4>获聘竞争力 · 研究判断</h4><p>${esc(assessment.competition)}</p></article><article><h4>你可以借鉴</h4><p>${esc(assessment.lesson)}</p></article></div><p class="assessment-method">${esc(data.assessmentPolicy.text)}</p></section><section class="profile-section"><h3>导师与学术平台</h3><p>${esc(person.connections)}</p><p>${esc(assessment.training)}</p><div class="mentor-grid">${mentors}</div><div class="assessment-sources">${evidenceLinks(assessment.sources.slice(0, 3), "人物来源")}</div></section>${timeline ? `<section class="profile-section"><h3>成果与岗位时间线</h3><ol class="assessment-timeline">${timeline}</ol></section>` : ""}`;
}

function paperHtml(person, paper) {
  const [year, title, venue, authors] = paper;
  const work = person.assessment?.works.find((item) => item.title === title);
  const guide = venueContext(venue);
  let timing = "";
  if (person.facultyStart && Number.isFinite(Number(year))) {
    const start = Number(person.facultyStart.slice(0, 4));
    timing = Number(year) < start
      ? "书目年份早于 AP 入职年份"
      : Number(year) === start
        ? "书目与 AP 入职同年，申请时状态待核"
        : "书目年份晚于 AP 入职年份，申请时状态待核";
  }
  return `<article class="profile-paper"><time>${esc(year)}</time><div><h4>${esc(title)}</h4><p>${esc(venue)}</p><p>${esc(authors)}</p>${timing ? `<p class="paper-timing">${esc(timing)}</p>` : ""}${work ? `<div class="paper-reading"><span>${esc(work.reading)}</span><p>${esc(work.assessment)}</p><div class="assessment-sources">${evidenceLinks(work.sources.slice(0, 3), "论文依据")}</div></div>` : ""}${guide ? `<details class="venue-context"><summary>刊物定位 · 项目判断</summary><p>${esc(guide.judgment)}</p><div class="assessment-sources">${evidenceLinks(guide.sources, "刊物来源")}</div></details>` : ""}</div></article>`;
}

function openProfile(id) {
  const person = data.people.find((p) => p.id === id);
  if (!person) return;
  const assessment = person.assessment;
  const audit = (person.bibliographyAudit || [])
    .map((entry) => `<p>${esc(entry.record.join(" · "))}。${esc(entry.reason)}</p>`)
    .join("");
  const questions = (assessment?.openQuestions || [])
    .map((question) => `<li>${esc(question)}</li>`)
    .join("");
  $("#profile-content").innerHTML = `
    <div class="profile-toolbar"><span>THE FACULTY ATLAS / ${person.id}</span><button class="close-button" data-close="profile-dialog" aria-label="关闭人物档案">×</button></div>
    <div class="profile-body">
      <span class="school-chip" data-school="${person.school}">${person.school} · ${schools[person.school]}</span>
      <h2 id="profile-title">${esc(person.name)}</h2>
      <p class="profile-subline">${esc(person.zhName)}${person.zhName ? " · " : ""}${esc(person.role)}</p>
      <p class="profile-meta">档案 ${person.id} · 最近资料核查 ${esc(person.reviewedAt)} · ${esc(stageLabel(person))}</p>
      <div class="profile-actions"><button data-favorite="${person.id}" aria-pressed="${favorites.has(id)}">${favorites.has(id) ? "★ 已收藏" : "☆ 收藏档案"}</button><button data-compare="${person.id}" aria-pressed="${compare.has(id)}">${compare.has(id) ? "✓ 已加入比较" : "＋ 加入比较"}</button><button data-copy="${person.id}">复制档案链接 ↗</button></div>
      ${assessmentHtml(person)}
      <section class="profile-section"><h3>学历与任职记录</h3><p>${esc(person.education)}</p><p>${esc(person.joined)}</p><div class="career-text">${esc(person.career)}</div></section>
      <section class="profile-section"><h3>代表作与刊物 <span class="profile-meta">${person.papers.length} 条书目</span></h3><p class="paper-time-note">${esc(data.assessmentPolicy.journalNote)} 年份按书目记载，申请时状态以 CV 和录用记录核定。</p>${person.papers.map((paper) => paperHtml(person, paper)).join("") || "<p>精选书目待补充。</p>"}${audit ? `<details class="bibliography-audit"><summary>原始书目校核记录</summary>${audit}</details>` : ""}</section>
      <section class="profile-section"><h3>进一步阅读</h3><p>${esc(person.relevance)}</p></section>
      <section class="profile-section"><h3>仍需核实</h3><ul class="assessment-questions">${questions}</ul><p>${esc([person.notes, person.progress].filter(Boolean).join("\n")) || esc(person.evidenceNote)}</p></section>
      <section class="profile-section"><h3>原始来源</h3>${sourcesHtml(person)}</section>
    </div>`;
  const url = new URL(location.href);
  url.searchParams.set("person", id);
  history.replaceState(null, "", url);
  openDialog("profile-dialog");
  $("#profile-dialog").scrollTop = 0;
}


function toggleCompare(id) {
  if (compare.has(id)) compare.delete(id);
  else if (compare.size < 3) compare.add(id);
  else {
    notify("最多并排比较 3 位研究者。");
    return;
  }
  $("#compare-tray").hidden = compare.size === 0;
  $("#compare-count").textContent = `已选择 ${compare.size} / 3 位研究者`;
  $("#compare-names").textContent = [...compare]
    .map((key) => data.people.find((p) => p.id === key).name)
    .join(" · ");
  $("#open-compare").disabled = compare.size < 2;
  document.querySelectorAll("[data-compare]").forEach((button) => {
    const selected = compare.has(button.dataset.compare);
    button.setAttribute("aria-pressed", String(selected));
    button.textContent = button.classList.contains("compare-pick")
      ? selected
        ? "已加入"
        : "对比"
      : selected
        ? "✓ 已加入比较"
        : "＋ 加入比较";
  });
}

function openComparison() {
  if (compare.size < 2) return;
  const people = [...compare].map((id) => data.people.find((p) => p.id === id));
  $("#comparison-content").innerHTML =
    `<div class="comparison-grid" style="--columns:${people.length}">${people
      .map(
        (person) =>
          `<article class="compare-column"><span class="school-chip" data-school="${person.school}">${person.school}</span><h3>${esc(person.name)}</h3><p>${esc(person.role)}</p><h4>香港任职节点</h4><p>${esc(person.joined)}</p><h4>学历与训练</h4><p>${esc(person.education)}</p><h4>任职与流动</h4><p>${esc(person.career)}</p><h4>公开学术连接</h4><p>${esc(person.connections)}</p>${assessmentHtml(person, true)}<h4>精选论文 · ${person.papers.length} 条</h4>${
            person.papers
              .slice(0, 3)
              .map(
                ([year, title, venue]) =>
                  `<p class="comparison-paper">${esc(year)} · ${esc(title)}<br>${esc(venue)}</p>`,
              )
              .join("") || "<p>精选书目待补充，见原始来源。</p>"
          }<h4>待核事项</h4><p>${esc(person.notes || person.evidenceNote)}</p><h4>原始来源</h4>${sourcesHtml(person)}</article>`,
      )
      .join(
        "",
      )}</div><p class="comparison-footer">精选论文数量反映本次收录范围，实际研究贡献和求职阶段需逐项核读。</p>`;
  openDialog("compare-dialog");
}

function showInfo(title, content) {
  $("#info-title").textContent = title;
  $("#info-content").innerHTML = content;
  openDialog("info-dialog");
  $("#info-dialog").scrollTop = 0;
}

function renderRoster(query = "") {
  const q = query.toLowerCase().trim();
  const list = data.roster.filter((p) =>
    `${p.name} ${schools[p.school]}`.toLowerCase().includes(q),
  );
  $("#roster-results").innerHTML =
    `<p class="roster-caption">${list.length} 条记录 · 名录中的职位类型与首次入职日期需要分别核读。</p>` +
    list
      .map(
        (p) =>
          `<div class="roster-item"><strong>${esc(p.name)}<br><small>${schools[p.school]}</small></strong><a href="${esc(safeSource(p.url)?.href || "#")}" target="_blank" rel="noopener noreferrer">官方来源 ↗</a></div>`,
      )
      .join("");
}

function renderAnalysisRoute(key) {
  const route = data.analysis.routes.find((item) => item.id === key);
  const tabs = document.querySelectorAll("[data-analysis-route]");
  tabs.forEach((tab) => {
    const selected = tab.dataset.analysisRoute === key;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  $("#analysis-route").setAttribute("aria-labelledby", `analysis-tab-${key}`);
  $("#analysis-route").innerHTML = `
    <div class="route-judgment"><h3>${esc(route.title)}</h3><p>${esc(route.judgment)}</p></div>
    <div class="evidence-cases">${route.cases.map((item) => {
      const person = data.people.find((p) => p.id === item.personId);
      return `<article class="evidence-case"><div class="case-heading"><span>${esc(person.school)}</span><h4>${esc(person.zhName || person.name)}</h4></div><p>${esc(item.observation)}</p><p class="case-lesson">${esc(item.lesson)}</p><button class="text-button" data-open="${person.id}">履历、论文与原始来源 ↗</button></article>`;
    }).join("")}</div>
    <div class="route-questions"><h4>核实具体岗位时，可以逐项了解</h4><ul>${route.questions.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>`;
}

function renderResearch() {
  const analysis = data.analysis;
  const coverage = data.meta.assessmentCoverage;
  $("#assessment-coverage").textContent = `${coverage.profiles} 份逐人解读 · ${coverage.mentorBiographies} 位导师与平台学者背景，覆盖 ${coverage.profilesWithMentorBiographies} 份档案 · ${coverage.abstractReadProfiles} 人含原始摘要核读。各档案标注核读依据与待核事项。`;
  $("#analysis-summary").textContent = analysis.summary;
  $("#analysis-basis").textContent = analysis.basis;
  $("#report-caption").textContent = `${data.meta.report.pages} 页 · ${data.meta.report.edition}`;
  $("#analysis-tabs").innerHTML = analysis.routes.map((route) =>
    `<button role="tab" id="analysis-tab-${route.id}" data-analysis-route="${route.id}" aria-controls="analysis-route" aria-selected="false" tabindex="-1">${esc(route.label)}</button>`,
  ).join("");
  renderAnalysisRoute(analysis.routes[0].id);
  $("#decision-factors").innerHTML = analysis.factors.map(([title, body]) =>
    `<article><h4>${esc(title)}</h4><p>${esc(body)}</p></article>`,
  ).join("");
  $("#analysis-ai").textContent = analysis.aiNote;
  $("#research-roadmap").innerHTML = analysis.roadmap.map((step, index) =>
    `<details class="roadmap-step" ${index === 0 ? "open" : ""}><summary><span>${esc(step.stage)}</span><strong>${esc(step.title)}</strong></summary><ul>${step.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></details>`,
  ).join("");
  const withoutPapers = data.people.filter((p) => !p.papers.length);
  const uncertainDates = data.people.filter((p) => p.category === "待核日期");
  $("#coverage-metrics").innerHTML = `
    <div><strong>${data.people.length}</strong><span>已建人物档案</span></div>
    <div><strong>${data.people.reduce((sum, p) => sum + p.papers.length, 0)}</strong><span>精选书目条目</span></div>
    <button data-audit="papers"><strong>${withoutPapers.length}</strong><span>尚无精选书目的档案 ↗</span></button>
    <button data-audit="dates"><strong>${uncertainDates.length}</strong><span>归类为入职日期待核 ↗</span></button>`;
  const rows = Object.entries(schools).map(([key, name]) => {
    const profiles = data.people.filter((p) => p.school === key);
    return `<tr><th scope="row">${key}<small>${name}</small></th><td>${data.roster.filter((p) => p.school === key).length}</td><td>${profiles.length}</td><td>${profiles.filter((p) => p.category === "窗口内").length}</td><td>${profiles.filter((p) => !p.papers.length).length}</td></tr>`;
  }).join("");
  $("#coverage-schools").innerHTML = `<table><caption>五校资料收录概况</caption><thead><tr><th scope="col">学校</th><th scope="col">名录记录</th><th scope="col">人物档案</th><th scope="col">窗口内入职与流动</th><th scope="col">尚无精选书目</th></tr></thead><tbody>${rows}</tbody></table>`;
  $("#research-tasks").innerHTML = analysis.tasks.map((task) =>
    `<article class="research-task"><div><h3>${esc(task.title)}</h3><span>${esc(task.status)}</span></div><p>${esc(task.detail)}</p></article>`,
  ).join("");
}

function showResearchAudit(kind) {
  const missingPapers = kind === "papers";
  const people = data.people.filter((p) => missingPapers ? !p.papers.length : p.category === "待核日期");
  showInfo(missingPapers ? "尚无精选书目的档案" : "入职日期待核档案",
    `<p>${missingPapers ? "以下档案的论文精选尚待补充。可进入档案查看现有主页与 CV 来源。" : "以下人物已建立档案，正式入职年月仍待核。其余分类中的日期精度也需分别查看。"}</p><div class="audit-list">${people.map((p) => `<button data-open="${p.id}"><strong>${esc(p.name)}</strong><span>${esc(p.school)} · ${esc(p.joined)} ↗</span></button>`).join("")}</div>`,
  );
}

function renderStaticSections() {
  const papers = data.people.reduce((sum, p) => sum + p.papers.length, 0);
  $("#hero-stats").innerHTML = [
    [data.people.length, "人物档案"],
    [papers, "精选论文"],
    [5, "香港高校"],
  ]
    .map(
      ([number, label]) =>
        `<div class="stat"><strong>${number}</strong><span>${label}</span></div>`,
    )
    .join("");
  $("#edition").textContent = data.meta.version;
  $("#topic-filter").innerHTML += [
    ...new Set(data.people.flatMap((p) => p.topics)),
  ]
    .map((topic) => `<option value="${esc(topic)}">${esc(topic)}</option>`)
    .join("");
  const paths = [
    [
      "欧洲研究经历",
      "从香港博士到欧洲研究",
      "香港博士",
      "欧洲研究岗位",
      "回港 AP",
      "曹鑫林的公开履历连接了浸会博士、奥地利研究岗位、理大 RAP 与助理教授。",
      "P002",
    ],
    [
      "本地研究路径",
      "在香港积累，进入教职",
      "博士",
      "香港博后 / RAP",
      "香港 AP",
      "胡嘉顺在理大经历博后、RAP 与 AP，唐榕也从理大博后进入助理教授岗位。",
      "P004",
    ],
    [
      "直接入职路径",
      "博士之后，直接进入 AP",
      "本科训练",
      "博士研究",
      "香港 AP",
      "赖乐潇的 CV 将 Columbia 博士与港大助理教授直接衔接。具体成果与方向匹配见人物档案。",
      "P001",
    ],
  ];
  $("#pathway-grid").innerHTML = paths
    .map(
      ([kind, title, first, second, third, text, id]) =>
        `<article class="pathway-card"><span class="route-kind">${kind}</span><h3>${title}</h3><div class="route-line"><span>${first}</span><i>→</i><span>${second}</span><i>→</i><span>${third}</span></div><p>${text}</p><button data-open="${id}">查看真实案例 ↗</button></article>`,
    )
    .join("");
  $("#change-list").innerHTML = [...data.changes]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(
      (change) =>
        `<article class="change-item"><time>${esc(change.date)}</time><h3>${esc(change.title)}</h3><p>${esc(change.summary)}</p></article>`,
    )
    .join("");
  $("#updated-label").textContent = `资料最近更新 ${data.meta.updatedAt}`;
  $("#schedule-label").textContent =
    data.meta.schedule.status === "active"
      ? "每月 1 日 · 10:00 更新"
      : "月度更新安排配置中";
  $("#footer-coverage").textContent = data.meta.coverageNote;
  renderResearch();
}

function bindEvents() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button.dataset.open) openProfile(button.dataset.open);
    else if (button.dataset.favorite) toggleFavorite(button.dataset.favorite);
    else if (button.dataset.compare) toggleCompare(button.dataset.compare);
    else if (button.dataset.close) closeDialog(button.dataset.close);
    else if (button.dataset.journey) renderJourney(button.dataset.journey);
    else if (button.dataset.analysisRoute) renderAnalysisRoute(button.dataset.analysisRoute);
    else if (button.dataset.audit) showResearchAudit(button.dataset.audit);
    else if ("school" in button.dataset) setSchool(button.dataset.school);
    else if (button.dataset.page) {
      state.page = Number(button.dataset.page);
      renderPeople();
      $("#directory").scrollIntoView({ behavior: "smooth" });
    } else if ("reset" in button.dataset) resetFilters();
    else if (button.dataset.copy) {
      try {
        await navigator.clipboard.writeText(
          new URL(`?person=${button.dataset.copy}`, location.href).href,
        );
        notify("档案链接已复制。");
      } catch {
        notify("可复制浏览器地址栏中的档案链接。");
      }
    }
  });
  $("#search").addEventListener("input", (event) => {
    state.query = event.target.value;
    state.page = 1;
    renderPeople();
  });
  for (const [selector, key] of [
    ["#topic-filter", "topic"],
    ["#stage-filter", "stage"],
    ["#sort", "sort"],
  ]) {
    $(selector).addEventListener("change", (event) => {
      state[key] = event.target.value;
      state.page = 1;
      renderPeople();
    });
  }
  $("#favorite-filter").addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    state.page = 1;
    renderPeople();
  });
  $("#reset-filters").addEventListener("click", resetFilters);
  $("#clear-compare").addEventListener("click", () =>
    [...compare].forEach(toggleCompare),
  );
  $("#open-compare").addEventListener("click", openComparison);
  $("#method-button").addEventListener("click", () =>
    showInfo(
      "证据与覆盖范围",
      `<p>研究以五校主要数学院系为核心，涵盖优化、运筹、计算数学、AI 及其他数学方向。初始调查窗口为 ${esc(data.meta.windowStart)} 至 ${esc(data.meta.windowEnd)}，同时保留历史与资深对照。</p><h3>公开来源</h3><p>采用大学现行名录、官方新教师公告、本人 CV、研究主页和大学研究资料库。每份档案均附原始来源。</p><h3>待核事项</h3><p>${esc(data.meta.coverageNote)} 部分现职存在网页表述冲突，详见个案。统计、工程、数据科学等院系只收录与主名单交叉的案例。</p><h3>阅读方式</h3><p>学术连接记录公开的导师、mentor、host 与共同作者。论文按原始书目保留年份和状态，申请时已有的成果仍需回溯。当前在职、晋升与个人长期聘任分别核查。</p><h3>收藏与比较</h3><p>收藏保存在当前浏览器。人物比较支持同时查看两至三份档案。研究主题标签由公开介绍与精选论文关键词整理，用于辅助检索。</p>`,
    ),
  );
  $("#decision-button").addEventListener("click", () =>
    showInfo(
      "博后选择清单",
      '<p>比较具体合作导师与研究条件，保留你当前研究主线的连续性。</p><ol class="decision-list">' +
        [
          [
            "研究问题",
            "未来 12—24 个月可以主导哪些题目，新增的数学困难与现有工作如何衔接？",
          ],
          [
            "研究独立性",
            "能否建立由你主导的新方向，合作方式、署名与研究陈述如何安排？",
          ],
          [
            "训练与资源",
            "讨论频率、理论指导、计算资源、教学与行政负担分别怎样？",
          ],
          [
            "外部连接",
            "哪些研讨会、访问与实质合作能让外部同行持续了解你的贡献？",
          ],
          [
            "培养与求职支持",
            "以往博后的公开成果和去向怎样，是否支持外出报告与 job talk 准备？",
          ],
          [
            "岗位条件",
            "合同期限、资金、到岗日和实际申请时间是否匹配你的毕业计划？",
          ],
        ]
          .map(([title, text]) => `<li><strong>${title}</strong>${text}</li>`)
          .join("") +
        "</ol>",
    ),
  );
  $("#roster-button").addEventListener("click", () => {
    showInfo(
      "现行名录筛查",
      '<input class="roster-search" id="roster-search" type="search" placeholder="搜索姓名或学校" aria-label="搜索名录底表"><div id="roster-results"></div>',
    );
    renderRoster();
    $("#roster-search").addEventListener("input", (event) =>
      renderRoster(event.target.value),
    );
  });
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        dialog.close();
    });
    dialog.addEventListener("close", () => {
      if (!document.querySelector("dialog[open]"))
        document.body.classList.remove("dialog-open");
      if (dialog.id === "profile-dialog") {
        const url = new URL(location.href);
        url.searchParams.delete("person");
        history.replaceState(null, "", url);
      }
    });
  });
  document.addEventListener("keydown", (event) => {
    const analysisTab = event.target.closest("[data-analysis-route]");
    if (analysisTab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const tabs = [...document.querySelectorAll("[data-analysis-route]")];
      const index = tabs.indexOf(analysisTab);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      renderAnalysisRoute(tabs[next].dataset.analysisRoute);
      tabs[next].focus();
    }
    if (
      event.key === "/" &&
      !document.querySelector("dialog[open]") &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)
    ) {
      event.preventDefault();
      $("#search").focus();
    }
    const tab = event.target.closest("[data-journey]");
    if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const keys = Object.keys(journeys);
      const index = keys.indexOf(tab.dataset.journey);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? keys.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + keys.length) %
              keys.length;
      renderJourney(keys[next]);
      $(`[data-journey="${keys[next]}"]`).focus();
    }
  });
}

async function init() {
  try {
    const response = await fetch("./data.json", { cache: "no-cache" });
    if (!response.ok)
      throw new Error(`Data request returned ${response.status}`);
    data = await response.json();
    if (!Array.isArray(data.people) || !Array.isArray(data.roster))
      throw new Error("The research dataset is incomplete");
    const knownIds = new Set(data.people.map((p) => p.id));
    favorites = new Set([...favorites].filter((id) => knownIds.has(id)));
    renderStaticSections();
    renderJourney("europe");
    renderPeople();
    bindEvents();
    const id = new URL(location.href).searchParams.get("person");
    if (id && knownIds.has(id)) openProfile(id);
  } catch (error) {
    $("#people-grid").setAttribute("aria-busy", "false");
    $("#people-grid").innerHTML =
      '<div class="empty-state"><h3>档案暂时未能载入</h3><p>请刷新页面重试，完整研究报告仍可从页面顶部打开。</p><button onclick="location.reload()">重新载入 ↻</button></div>';
    console.error("Faculty Atlas could not load", error);
  }
}
init();
