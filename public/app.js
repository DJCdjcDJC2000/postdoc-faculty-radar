const state = {
  data: null,
  view: "home",
  radarFilters: {
    search: "",
    region: "",
    roleType: "",
    topic: "",
    priority: "",
    deadline: "",
    stage: "",
    country: "",
    sourceTrust: "",
    timeline2029: "",
    hostRequired: "",
    funding: "",
    visa: "",
    teaching: "",
    orientation: ""
  },
  selectedJobId: null,
  selectedPersonId: null,
  selectedLabId: null,
  caseFilters: {
    search: "",
    region: "",
    type: "",
    topic: "",
    recruitment: ""
  },
  calendarTab: "fellowships"
};

const els = {
  nav: document.querySelector("#main-nav"),
  modePill: document.querySelector("#mode-pill"),
  drawer: document.querySelector("#detail-drawer"),
  pages: {
    home: document.querySelector("#page-home"),
    radar: document.querySelector("#page-radar"),
    routes: document.querySelector("#page-routes"),
    cases: document.querySelector("#page-cases"),
    calendar: document.querySelector("#page-calendar"),
    methods: document.querySelector("#page-methods")
  }
};

await init();

async function init() {
  state.data = await fetchJson("./data/site.json", fallbackData());
  state.view = location.hash?.replace("#", "") || "home";
  renderShell();
  renderAll();
  bindGlobalEvents();
  setView(state.view);
}

async function fetchJson(url, fallback) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

function renderShell() {
  const nav = state.data.copy?.navigation ?? [];
  els.nav.innerHTML = nav.map((item) => `
    <a href="#${escapeAttr(item.id)}" class="nav-link" data-view="${escapeAttr(item.id)}">${escapeHtml(item.label)}</a>
  `).join("");
  els.modePill.textContent = state.data.mode === "private" ? "个人版" : "公开版";
}

function bindGlobalEvents() {
  window.addEventListener("hashchange", () => setView(location.hash.replace("#", "") || "home"));
  document.addEventListener("click", (event) => {
    const jobButton = event.target.closest("[data-job-id]");
    if (jobButton) {
      showJobDetail(jobButton.dataset.jobId);
      return;
    }
    const personButton = event.target.closest("[data-person-id]");
    if (personButton) {
      showPersonDetail(personButton.dataset.personId);
      return;
    }
    const labButton = event.target.closest("[data-lab-id]");
    if (labButton) {
      showLabDetail(labButton.dataset.labId);
      return;
    }
    if (event.target.closest("[data-close-drawer]")) {
      closeDrawer();
    }
    const calendarTab = event.target.closest("[data-calendar-tab]");
    if (calendarTab) {
      state.calendarTab = calendarTab.dataset.calendarTab;
      renderCalendar();
    }
  });
}

function renderAll() {
  renderHome();
  renderRadar();
  renderRoutes();
  renderCases();
  renderCalendar();
  renderMethods();
}

function setView(view) {
  const safeView = els.pages[view] ? view : "home";
  state.view = safeView;
  Object.entries(els.pages).forEach(([id, node]) => node.classList.toggle("active", id === safeView));
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === safeView));
}

function renderHome() {
  const { data } = state;
  const metrics = data.metrics ?? {};
  const featuredJobs = highMatchJobs().slice(0, 6);
  const featuredLabs = sortedLabs().slice(0, 4);
  const featuredPeople = sortedPeople().slice(0, 3);
  const activeSources = (data.sources ?? []).filter((source) => source.status === "ok").slice(0, 6);

  els.pages.home.innerHTML = `
    <section class="hero-band">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(data.copy?.tagline ?? "官方优先、公开可证")}</p>
        <h1>${escapeHtml(data.copy?.title ?? "博后教职职业情报门户")}</h1>
        <p class="lead">${escapeHtml(data.copy?.subtitle ?? "")}</p>
      </div>
      <div class="briefing-strip" aria-label="本周情报摘要">
        ${metricCard("新增机会", metrics.totalJobs ?? 0, "全站候选")}
        ${metricCard("A/B 高匹配", metrics.highMatchJobs ?? 0, "优先查看")}
        ${metricCard("目标课题组", metrics.targetLabs ?? 0, "导师/PI 雷达")}
        ${metricCard("活跃数据源", `${metrics.activeSources ?? 0}/${metrics.totalSources ?? 0}`, "最近抓取")}
      </div>
    </section>

    ${state.data.mode === "private" ? renderPrivatePlanSummary() : ""}

    <section class="section-band">
      <div class="section-head">
        <div>
          <p class="eyebrow">精选机会</p>
          <h2>本周高匹配机会</h2>
        </div>
        <a href="#radar" class="text-link">进入机会雷达</a>
      </div>
      <div class="opportunity-grid">
        ${featuredJobs.length ? featuredJobs.map(jobCard).join("") : emptyBlock("暂无 A/B 高匹配机会")}
      </div>
    </section>

    <section class="section-band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Career Routes</p>
          <h2>职业路线入口</h2>
        </div>
        <a href="#routes" class="text-link">查看全部路线</a>
      </div>
      <div class="route-grid compact">
        ${(data.routes ?? []).map(routeCard).join("")}
      </div>
    </section>

    <section class="section-band">
      <div class="section-head">
        <div>
          <p class="eyebrow">PI Radar</p>
          <h2>QS Top 50 目标导师/课题组</h2>
        </div>
        <a href="#cases" class="text-link">进入导师与学者库</a>
      </div>
      <div class="lab-grid compact">
        ${featuredLabs.length ? featuredLabs.map(labCard).join("") : emptyBlock("目标导师库待补充")}
      </div>
    </section>

    <section class="split-band">
      <div>
        <div class="section-head inline">
          <div>
            <p class="eyebrow">成功案例</p>
            <h2>公开职业路径样本</h2>
          </div>
          <a href="#cases" class="text-link">进入案例库</a>
        </div>
        <div class="person-list">${featuredPeople.length ? featuredPeople.map(personCard).join("") : emptyBlock("案例库待补充公开可验证样本")}</div>
      </div>
      <div>
        <div class="section-head inline">
          <div>
            <p class="eyebrow">Source Health</p>
            <h2>数据源状态</h2>
          </div>
          <a href="#methods" class="text-link">查看方法</a>
        </div>
        <div class="source-list">${activeSources.length ? activeSources.map(sourceRow).join("") : emptyBlock("暂无成功抓取的数据源")}</div>
      </div>
    </section>
  `;
}

function renderRadar() {
  els.pages.radar.innerHTML = `
    <section class="page-heading">
      <p class="eyebrow">Opportunity Radar</p>
      <h1>机会雷达</h1>
      <p>常驻筛选用于日常浏览，高级筛选用于深度比较。点击任意岗位可查看匹配分析、申请信息和来源记录。</p>
    </section>
    <section class="filter-band">
      ${filterInput("search", "搜索", "optimization, HKUST, Postdoc")}
      ${filterSelect("region", "地区", optionsFrom(state.data.jobs, "region"))}
      ${filterSelect("roleType", "岗位类型", optionsFrom(state.data.jobs, "roleType", "roleLabelZh"))}
      ${filterSelect("topic", "研究方向", keywordOptions())}
      ${filterSelect("priority", "匹配度", ["A", "B", "C", "D"].map((v) => [v, v]))}
      ${filterSelect("deadline", "截止日期", [["30", "30 天内"], ["90", "90 天内"], ["none", "长期/未知"]])}
      ${filterSelect("stage", "申请阶段", stageOptions())}
      <details class="advanced-filters">
        <summary>高级筛选</summary>
        <div class="advanced-grid">
          ${filterInput("country", "国家/城市", "Netherlands / Hong Kong / Singapore")}
          ${filterSelect("sourceTrust", "来源可信度", optionsFrom(state.data.jobs, "trust", "sourceTrustLabelZh"))}
          ${filterSelect("timeline2029", "2029 时间线", [["yes", "适合"], ["watch", "观察"], ["early", "偏早"]])}
          ${filterSelect("hostRequired", "host/提名", [["yes", "需要"], ["no", "不需要"], ["unknown", "未知"]])}
          ${filterSelect("funding", "薪资/资助", [["yes", "有信息"], ["unknown", "未知"]])}
          ${filterSelect("visa", "国际申请/签证", [["yes", "支持"], ["unknown", "未知"]])}
          ${filterSelect("teaching", "teaching 要求", [["yes", "需要"], ["no", "不需要"], ["unknown", "未知"]])}
          ${filterSelect("orientation", "理论/算法/应用/工程", [["theory", "理论"], ["algorithm", "算法"], ["application", "应用"], ["engineering", "工程"]])}
        </div>
      </details>
    </section>
    <section class="table-section">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>匹配度</th>
              <th>岗位标题</th>
              <th>机构</th>
              <th>地区</th>
              <th>类型</th>
              <th>研究方向</th>
              <th>截止日期</th>
              <th>申请阶段</th>
              <th>来源可信度</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="jobs-table-body"></tbody>
        </table>
      </div>
    </section>
  `;

  els.pages.radar.querySelectorAll("[data-filter]").forEach((control) => {
    control.addEventListener("input", (event) => {
      state.radarFilters[event.target.dataset.filter] = event.target.value;
      renderRadarTable();
    });
  });
  renderRadarTable();
}

function renderRadarTable() {
  const body = document.querySelector("#jobs-table-body");
  if (!body) return;
  const jobs = filteredJobs();
  body.innerHTML = jobs.length ? jobs.map(jobRow).join("") : `<tr><td colspan="10">${emptyBlock("没有匹配当前筛选的机会")}</td></tr>`;
}

function renderRoutes() {
  els.pages.routes.innerHTML = `
    <section class="page-heading">
      <p class="eyebrow">Career Routes</p>
      <h1>职业路线</h1>
      <p>按当前规划排序：先博后 / Research Fellow，再教职或研究岗。每条路线都连接代表机会、成功案例和准备清单。</p>
    </section>
    <section class="route-grid">
      ${(state.data.routes ?? []).map(routeDetailCard).join("")}
    </section>
  `;
}

function renderCases() {
  const labs = filteredLabs();
  const people = filteredPeople();
  els.pages.cases.innerHTML = `
    <section class="page-heading">
      <p class="eyebrow">PI & Scholar Intelligence</p>
      <h1>导师与学者</h1>
      <p>统一追踪 QS Top 50 重点课题组、潜在 postdoc host、青年学者路径、基金/奖项和代表作。所有条目只使用公开可验证来源，申请前必须回到原始链接核验。</p>
    </section>
    <section class="filter-band case-filter-band">
      ${caseFilterInput("search", "搜索", "ETH, stochastic, HKUST, DRO")}
      ${caseFilterSelect("region", "地区", caseRegionOptions())}
      ${caseFilterSelect("type", "类型", [["labs", "目标导师/课题组"], ["people", "青年学者案例"]])}
      ${caseFilterSelect("topic", "方向", caseTopicOptions())}
      ${caseFilterSelect("recruitment", "招聘信号", [["active", "明确 openings"], ["watch", "长期观察"], ["fellowship", "Fellowship host"]])}
    </section>
    <section class="section-band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Target Groups</p>
          <h2>QS Top 50 目标导师/课题组</h2>
        </div>
        <span class="muted">${labs.length} 个匹配条目</span>
      </div>
      <div class="lab-grid">
        ${labs.length ? labs.map(labCard).join("") : emptyBlock("当前筛选下没有匹配课题组")}
      </div>
    </section>
    <section class="section-band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Young Scholars</p>
          <h2>青年学者路径样本</h2>
        </div>
        <span class="muted">${people.length} 个匹配条目</span>
      </div>
    <section class="person-grid">
        ${people.length ? people.map(personCard).join("") : emptyBlock("当前筛选下没有匹配人物")}
    </section>
    </section>
  `;
  els.pages.cases.querySelectorAll("[data-case-filter]").forEach((control) => {
    control.addEventListener("input", (event) => {
      state.caseFilters[event.target.dataset.caseFilter] = event.target.value;
      renderCases();
    });
  });
}

function renderCalendar() {
  const calendar = state.data.calendar ?? {};
  els.pages.calendar.innerHTML = `
    <section class="page-heading">
      <p class="eyebrow">Application Calendar</p>
      <h1>申请日历</h1>
      <p>把 Fellowship 周期、岗位截止和个人行动分开，避免把长期准备和短期截止混在一起。</p>
    </section>
    <nav class="segmented" aria-label="申请日历视图">
      ${calendarTabButton("fellowships", "Fellowship 周期")}
      ${calendarTabButton("deadlines", "岗位截止")}
      ${state.data.mode === "private" ? calendarTabButton("actions", "个人行动") : ""}
    </nav>
    <section class="calendar-panel">
      ${renderCalendarPanel(calendar)}
    </section>
  `;
}

function renderMethods() {
  const methodology = state.data.copy?.methodology ?? {};
  els.pages.methods.innerHTML = `
    <section class="page-heading">
      <p class="eyebrow">Resources & Methods</p>
      <h1>资源与方法</h1>
      <p>公开说明数据从哪里来、如何评分、什么能公开、AI 在哪里参与，以及为什么申请前必须回到原始链接核验。</p>
    </section>
    <section class="method-grid">
      ${methodCard("数据源原则", methodology.sourcePrinciple)}
      ${methodCard("匹配度评分", "综合岗位类型、地区优先级、研究方向关键词、截止紧急度和来源可信度；A/B 机会进入重点提醒。")}
      ${methodCard("隐私边界", methodology.privacy)}
      ${methodCard("AI 辅助", methodology.aiNotice)}
      ${methodCard("免责声明", methodology.disclaimer)}
      ${methodCard("适用人群", state.data.profile?.publicAudience ?? "应用数学、优化、科学计算方向 PhD/Postdoc")}
    </section>
    <section class="table-section">
      <div class="section-head">
        <div>
          <p class="eyebrow">Sources</p>
          <h2>数据源清单</h2>
        </div>
      </div>
      <div class="source-list full">
        ${(state.data.sources ?? []).map(sourceRow).join("")}
      </div>
    </section>
  `;
}

function showJobDetail(jobId) {
  const job = state.data.jobs.find((item) => item.id === jobId);
  if (!job) return;
  els.drawer.classList.add("open");
  els.drawer.innerHTML = `
    <button class="drawer-close" data-close-drawer aria-label="关闭">×</button>
    <div class="drawer-body">
      <p class="eyebrow">机会详情</p>
      <h2>${escapeHtml(job.title)}</h2>
      <p class="muted">${escapeHtml(job.institution || job.sourceName || "")}</p>
      <div class="score-line">${scoreBadge(job)} <span>${escapeHtml(job.simpleReason || "")}</span></div>
      ${detailSection("基本信息", infoList([
        ["机构/院系", [job.institution, job.department].filter(Boolean).join(" / ")],
        ["地区", [job.country, job.region].filter(Boolean).join(" / ")],
        ["岗位类型", job.roleLabelZh],
        ["发布日期", job.publishedAt],
        ["截止日期", job.deadline || (job.evergreen ? "长期关注" : "未知")],
        ["来源可信度", job.sourceTrustLabelZh],
        ["原始链接", link(job.sourceUrl, "打开来源")]
      ]))}
      ${detailSection("匹配分析", `
        ${reasonList("加分项", job.ai?.positiveZh ?? [job.simpleReason])}
        ${reasonList("扣分项", job.ai?.negativeZh ?? job.negativeKeywords ?? [])}
        <p>${escapeHtml(job.ai?.summaryZh ?? "")}</p>
      `)}
      ${detailSection("研究方向", tagList(job.matchedKeywords ?? job.keywords ?? []))}
      ${detailSection("申请信息", infoList([
        ["host/提名", job.hostRequired ?? "待核验"],
        ["薪资/资助", job.funding ?? "待核验"],
        ["国际申请/签证", job.visa ?? "待核验"],
        ["teaching 要求", job.teaching ?? "待核验"],
        ["起始时间", job.startDate ?? "待核验"]
      ]))}
      ${state.data.mode === "private" ? detailSection("行动记录", renderPrivateJobState(job)) : ""}
      ${detailSection("关联人物和路径样本", renderRelatedPeople(job))}
      ${detailSection("AI 分析", `
        <p class="ai-notice">${escapeHtml(job.ai?.notice ?? "AI 辅助生成，需核验")}</p>
        <p>${escapeHtml(job.ai?.riskZh ?? "")}</p>
        <p><strong>下一步：</strong>${escapeHtml(job.ai?.nextStepZh ?? "")}</p>
        ${state.data.mode === "private" && job.ai?.personalAnalysisZh ? `<p><strong>个人画像：</strong>${escapeHtml(job.ai.personalAnalysisZh)}</p>` : ""}
        ${state.data.mode === "private" && job.ai?.gapAnalysisZh ? `<p><strong>差距分析：</strong>${escapeHtml(job.ai.gapAnalysisZh)}</p>` : ""}
      `)}
      ${detailSection("原始文本和抓取记录", infoList([
        ["来源", job.sourceName],
        ["抓取时间", formatDateTime(job.fetchedAt || job.updatedAt)],
        ["摘要", job.description]
      ]))}
    </div>
  `;
}

function showLabDetail(labId) {
  const lab = (state.data.labs ?? []).find((item) => item.id === labId);
  if (!lab) return;
  els.drawer.classList.add("open");
  els.drawer.innerHTML = `
    <button class="drawer-close" data-close-drawer aria-label="关闭">×</button>
    <div class="drawer-body">
      <p class="eyebrow">目标导师/课题组</p>
      <h2>${escapeHtml(lab.leadNameZh ? `${lab.leadName} / ${lab.leadNameZh}` : lab.leadName)}</h2>
      <p class="muted">${escapeHtml([lab.groupName, lab.institution, lab.department].filter(Boolean).join(" · "))}</p>
      <div class="score-line">${labBadge(lab)} <span>${escapeHtml(lab.recruitmentSignalZh || "")}</span></div>
      ${detailSection("基本信息", infoList([
        ["学校/院系", [lab.institution, lab.department].filter(Boolean).join(" / ")],
        ["QS 范围", [lab.schoolScope, lab.qsRankDisplay].filter(Boolean).join(" · ")],
        ["权威等级", lab.authorityLevel],
        ["地区", [lab.country, lab.region].filter(Boolean).join(" / ")],
        ["课题组", lab.groupName],
        ["导师主页", link(lab.homepage, "打开导师主页")],
        ["课题组主页", link(lab.groupHomepage, "打开课题组主页")],
        ["招聘入口", link(lab.openingsUrl, "打开 openings")]
      ]))}
      ${detailSection("为什么关注", `<p>${escapeHtml(lab.fitZh || "")}</p><p>${escapeHtml(lab.whyTrackZh || "")}</p>`)}
      ${detailSection("研究方向", tagList(lab.fieldTags ?? []))}
      ${detailSection("可能路线", reasonList("路线", lab.potentialRoutes ?? []))}
      ${detailSection("代表作/方向证据", renderWorks(lab.representativeWorks ?? []))}
      ${detailSection("公开证据", renderEvidence(lab.evidence ?? []))}
    </div>
  `;
}

function showPersonDetail(personId) {
  const person = (state.data.people ?? []).find((item) => item.id === personId);
  if (!person) return;
  els.drawer.classList.add("open");
  els.drawer.innerHTML = `
    <button class="drawer-close" data-close-drawer aria-label="关闭">×</button>
    <div class="drawer-body">
      <p class="eyebrow">青年学者/路径案例</p>
      <h2>${escapeHtml(person.name)}</h2>
      <p class="muted">${escapeHtml(person.currentPosition || "")} · ${escapeHtml(person.currentInstitution || "")}</p>
      ${person.currentStatusZh ? `<p>${escapeHtml(person.currentStatusZh)}</p>` : ""}
      ${detailSection("职业路径摘要", `<p>${escapeHtml(person.ai?.careerPathZh ?? person.pathSummaryZh ?? "")}</p>`)}
      ${detailSection("职业路线图", renderPersonTimeline(person))}
      ${detailSection("背景表格", infoList([
        ["PhD 机构", person.phdInstitution],
        ["PhD 年份", person.phdYear],
        ["导师", person.advisor],
        ["Postdoc 经历", (person.postdocHistory ?? []).map((item) => `${item.institution} ${item.years ?? ""}`).join("；")],
        ["当前岗位类型", person.currentRoleType],
        ["权威/阶段", person.authorityLevel],
        ["可信度", person.confidence],
        ["公开主页", link(person.homepage, "打开主页")],
        ["Google Scholar", link(person.googleScholar, "打开 Scholar")]
      ]))}
      ${detailSection("研究方向", tagList(person.fieldTags ?? []))}
      ${detailSection("基金/奖项", reasonList("公开奖项", person.grantsAwards ?? []))}
      ${detailSection("代表作", renderWorks(person.representativePapers ?? []))}
      ${detailSection("可学习点", reasonList("可学习点", person.ai?.learningsZh ?? person.learningsZh ?? []))}
      ${detailSection("风险提醒", reasonList("不可简单复制", person.ai?.risksZh ?? person.risksZh ?? []))}
      ${detailSection("公开证据", renderEvidence(person.evidence ?? []))}
    </div>
  `;
}

function closeDrawer() {
  els.drawer.classList.remove("open");
  els.drawer.innerHTML = "";
}

function highMatchJobs() {
  return [...(state.data.jobs ?? [])]
    .filter((job) => ["A", "B"].includes(job.priority) && job.recordType !== "watch_seed")
    .sort(compareJobs);
}

function filteredJobs() {
  const filters = state.radarFilters;
  return [...(state.data.jobs ?? [])].filter((job) => {
    const searchText = [
      job.title,
      job.institution,
      job.department,
      job.region,
      job.country,
      job.roleLabelZh,
      job.description,
      ...(job.matchedKeywords ?? []),
      ...(job.keywords ?? []),
      job.ai?.summaryZh
    ].join(" ").toLowerCase();
    const days = daysUntil(job.deadline);
    return (!filters.search || searchText.includes(filters.search.toLowerCase()))
      && (!filters.region || job.region === filters.region)
      && (!filters.roleType || job.roleType === filters.roleType)
      && (!filters.topic || searchText.includes(filters.topic.toLowerCase()))
      && (!filters.priority || job.priority === filters.priority)
      && (!filters.deadline || deadlineMatches(filters.deadline, days, job))
      && (!filters.stage || (job.private?.myStage ?? "") === filters.stage)
      && (!filters.country || searchText.includes(filters.country.toLowerCase()))
      && (!filters.sourceTrust || job.trust === filters.sourceTrust)
      && (!filters.teaching || fieldMatches(job.teaching, filters.teaching))
      && (!filters.hostRequired || fieldMatches(job.hostRequired, filters.hostRequired))
      && (!filters.funding || fieldMatches(job.funding, filters.funding))
      && (!filters.visa || fieldMatches(job.visa, filters.visa))
      && (!filters.orientation || searchText.includes(filters.orientation));
  }).sort(compareJobs);
}

function compareJobs(a, b) {
  const gradeOrder = { A: 0, B: 1, C: 2, D: 3 };
  const gradeDelta = (gradeOrder[a.priority] ?? 9) - (gradeOrder[b.priority] ?? 9);
  if (gradeDelta) return gradeDelta;
  const deadlineDelta = daysUntil(a.deadline) - daysUntil(b.deadline);
  if (Number.isFinite(deadlineDelta) && deadlineDelta !== 0) return deadlineDelta;
  const regionOrder = { Europe: 0, "Hong Kong": 1, Singapore: 2, "Mainland China": 3 };
  const regionDelta = (regionOrder[a.region] ?? 9) - (regionOrder[b.region] ?? 9);
  if (regionDelta) return regionDelta;
  return (b.matchScore ?? 0) - (a.matchScore ?? 0);
}

function sortedPeople() {
  return [...(state.data.people ?? [])].sort((a, b) => (a.priority ?? "P9").localeCompare(b.priority ?? "P9"));
}

function sortedLabs() {
  const levelOrder = { A: 0, B: 1, C: 2, D: 3 };
  return [...(state.data.labs ?? [])].sort((a, b) => {
    const levelDelta = (levelOrder[a.matchLevel] ?? 9) - (levelOrder[b.matchLevel] ?? 9);
    if (levelDelta) return levelDelta;
    return (b.matchScore ?? 0) - (a.matchScore ?? 0);
  });
}

function filteredLabs() {
  const filters = state.caseFilters;
  if (filters.type === "people") return [];
  return sortedLabs().filter((lab) => caseItemMatches(lab, filters, "labs"));
}

function filteredPeople() {
  const filters = state.caseFilters;
  if (filters.type === "labs") return [];
  return sortedPeople().filter((person) => caseItemMatches(person, filters, "people"));
}

function caseItemMatches(item, filters, kind) {
  const searchText = [
    kind,
    item.name,
    item.nameZh,
    item.leadName,
    item.leadNameZh,
    item.groupName,
    item.institution,
    item.currentInstitution,
    item.department,
    item.country,
    item.region,
    item.currentPosition,
    item.currentStatusZh,
    item.recruitmentStatus,
    item.recruitmentSignalZh,
    item.fitZh,
    item.pathSummaryZh,
    ...(item.fieldTags ?? []),
    ...(item.potentialRoutes ?? []),
    ...(item.grantsAwards ?? [])
  ].filter(Boolean).join(" ").toLowerCase();
  return (!filters.search || searchText.includes(filters.search.toLowerCase()))
    && (!filters.region || item.region === filters.region || searchText.includes(filters.region.toLowerCase()))
    && (!filters.topic || searchText.includes(filters.topic.toLowerCase()))
    && (!filters.recruitment || caseRecruitmentMatches(item, filters.recruitment, searchText));
}

function caseRecruitmentMatches(item, filter, searchText) {
  const status = String(item.recruitmentStatus ?? "").toLowerCase();
  if (filter === "active") return status.includes("active");
  if (filter === "watch") return status.includes("watch") || !status;
  if (filter === "fellowship") return searchText.includes("fellowship") || searchText.includes("msca") || searchText.includes("humboldt");
  return true;
}

function metricCard(label, value, caption) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(caption)}</small></div>`;
}

function jobCard(job) {
  return `
    <article class="opportunity-card">
      <div class="card-top">${scoreBadge(job)} <span class="trust">${escapeHtml(job.sourceTrustLabelZh || "")}</span></div>
      <h3>${escapeHtml(job.title)}</h3>
      <p>${escapeHtml(job.institution || job.sourceName || "")}</p>
      <div class="meta-row"><span>${escapeHtml(job.region || "")}</span><span>${escapeHtml(job.roleLabelZh || "")}</span><span>${escapeHtml(job.deadline || "长期/未知")}</span></div>
      <div class="tag-list">${tagList(job.matchedKeywords ?? job.keywords ?? [])}</div>
      <p class="reason">${escapeHtml(job.ai?.summaryZh || job.simpleReason || "")}</p>
      <button class="inline-button" data-job-id="${escapeAttr(job.id)}">查看详情</button>
    </article>
  `;
}

function jobRow(job) {
  return `
    <tr>
      <td>${scoreBadge(job)}</td>
      <td><button class="row-title" data-job-id="${escapeAttr(job.id)}">${escapeHtml(job.title)}</button><div class="table-note">${escapeHtml(job.ai?.summaryZh || job.simpleReason || "")}</div></td>
      <td>${escapeHtml(job.institution || job.sourceName || "")}</td>
      <td>${escapeHtml(job.region || "")}</td>
      <td>${escapeHtml(job.roleLabelZh || "")}</td>
      <td>${tagList(job.matchedKeywords ?? job.keywords ?? [])}</td>
      <td>${escapeHtml(job.deadline || (job.evergreen ? "长期关注" : "未知"))}</td>
      <td>${escapeHtml(job.private?.myStage ?? (state.data.mode === "private" ? "未看" : "公开版不显示"))}</td>
      <td><span class="trust-label">${escapeHtml(job.sourceTrustLabelZh || "")}</span></td>
      <td><button class="tiny-button" data-job-id="${escapeAttr(job.id)}">详情</button></td>
    </tr>
  `;
}

function routeCard(route) {
  return `
    <article class="route-card">
      <h3>${escapeHtml(route.titleZh)}</h3>
      <p>${escapeHtml(route.fitZh)}</p>
    </article>
  `;
}

function routeDetailCard(route) {
  const jobs = routeJobs(route, 4);
  const people = routePeople(route, 3);
  return `
    <article class="route-detail">
      <div class="route-index">${String(route.order).padStart(2, "0")}</div>
      <h2>${escapeHtml(route.titleZh)}</h2>
      <p>${escapeHtml(route.fitZh)}</p>
      <div class="route-columns">
        ${routeColumn("申请时间线", route.timelineZh)}
        ${routeColumn("准备清单", route.preparationZh)}
        ${routeColumn("风险提醒", route.risksZh)}
        ${routeColumn("下一步行动", route.nextActionsZh)}
      </div>
      <div class="route-linked">
        ${linkedJobList("代表机会", jobs)}
        ${linkedPersonList("相关案例", people)}
      </div>
    </article>
  `;
}

function labCard(lab) {
  return `
    <article class="lab-card">
      <div class="person-top">
        ${labBadge(lab)}
        <span>${escapeHtml([lab.schoolScope, lab.qsRankDisplay].filter(Boolean).join(" · "))}</span>
      </div>
      <h3>${escapeHtml(lab.leadNameZh ? `${lab.leadName} / ${lab.leadNameZh}` : lab.leadName)}</h3>
      <p>${escapeHtml(lab.groupName || "")}</p>
      <p class="muted">${escapeHtml([lab.institution, lab.department].filter(Boolean).join(" · "))}</p>
      <div class="tag-list">${tagList(lab.fieldTags ?? [])}</div>
      <p class="reason">${escapeHtml(lab.fitZh || lab.recruitmentSignalZh || "")}</p>
      <button class="inline-button" data-lab-id="${escapeAttr(lab.id)}">查看导师/课题组</button>
    </article>
  `;
}

function personCard(person) {
  return `
    <article class="person-card">
      <div class="person-top"><span>${escapeHtml(person.priority ?? "P?")}</span><span>${escapeHtml(person.confidence ?? "待核验")}</span></div>
      <h3>${escapeHtml(person.name)}</h3>
      <p>${escapeHtml(person.currentPosition || "")}</p>
      <p class="muted">${escapeHtml(person.currentInstitution || "")}</p>
      <div class="tag-list">${tagList(person.fieldTags ?? [])}</div>
      <button class="inline-button" data-person-id="${escapeAttr(person.id)}">查看背景与代表作</button>
    </article>
  `;
}

function sourceRow(source) {
  const status = source.status === "ok" ? "正常" : source.status === "error" ? "失败" : "观察";
  return `
    <div class="source-row">
      <span class="status ${escapeAttr(source.status || "unknown")}">${escapeHtml(status)}</span>
      <a href="${escapeAttr(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.name)}</a>
      <span>${escapeHtml(source.region || "")}</span>
      <span>${escapeHtml(source.trust || "")}</span>
      <span>${Number(source.count ?? 0)} 条</span>
    </div>
  `;
}

function methodCard(title, body) {
  return `<article class="method-card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body || "")}</p></article>`;
}

function renderPrivatePlanSummary() {
  const plan = state.data.calendar?.preparationPlan;
  if (!plan) return "";
  return `
    <section class="private-band">
      <div>
        <p class="eyebrow">个人准备计划</p>
        <h2>${escapeHtml(plan.currentStage)}</h2>
        <p>${escapeHtml(plan.summaryZh)}</p>
      </div>
      <div class="tag-list">${(plan.risks ?? []).map((risk) => `<span class="tag warm">${escapeHtml(risk)}</span>`).join("")}</div>
    </section>
  `;
}

function renderCalendarPanel(calendar) {
  if (state.calendarTab === "deadlines") {
    return `<div class="timeline-list">${(calendar.deadlines ?? []).slice(0, 40).map((job) => `
      <button class="timeline-item" data-job-id="${escapeAttr(job.id)}">
        <span>${escapeHtml(job.deadline || "未知")}</span>
        <strong>${escapeHtml(job.title)}</strong>
        <small>${escapeHtml(job.institution || job.sourceName || "")}</small>
      </button>
    `).join("") || emptyBlock("暂无岗位截止记录")}</div>`;
  }
  if (state.calendarTab === "actions") {
    const plan = calendar.preparationPlan;
    return plan ? `<div class="route-grid">${plan.timeline.map((item) => `
      <article class="route-card">
        <h3>${escapeHtml(item.year)} · ${escapeHtml(item.focus)}</h3>
        ${reasonList("任务", item.tasks)}
      </article>
    `).join("")}</div>` : emptyBlock("暂无个人行动计划");
  }
  return `<div class="route-grid">${(calendar.fellowships ?? []).map(jobCard).join("") || emptyBlock("暂无 Fellowship 周期记录")}</div>`;
}

function filterInput(name, label, placeholder) {
  return `<label class="filter-control"><span>${escapeHtml(label)}</span><input data-filter="${escapeAttr(name)}" value="${escapeAttr(state.radarFilters[name])}" placeholder="${escapeAttr(placeholder)}"></label>`;
}

function filterSelect(name, label, options) {
  return `<label class="filter-control"><span>${escapeHtml(label)}</span><select data-filter="${escapeAttr(name)}"><option value="">全部</option>${options.map(([value, text]) => `<option value="${escapeAttr(value)}" ${state.radarFilters[name] === value ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>`;
}

function caseFilterInput(name, label, placeholder) {
  return `<label class="filter-control"><span>${escapeHtml(label)}</span><input data-case-filter="${escapeAttr(name)}" value="${escapeAttr(state.caseFilters[name])}" placeholder="${escapeAttr(placeholder)}"></label>`;
}

function caseFilterSelect(name, label, options) {
  return `<label class="filter-control"><span>${escapeHtml(label)}</span><select data-case-filter="${escapeAttr(name)}"><option value="">全部</option>${options.map(([value, text]) => `<option value="${escapeAttr(value)}" ${state.caseFilters[name] === value ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>`;
}

function optionsFrom(items, key, labelKey = key) {
  return [...new Map((items ?? []).filter((item) => item[key]).map((item) => [item[key], item[labelKey] ?? item[key]]))].sort((a, b) => String(a[1]).localeCompare(String(b[1]), "zh-CN"));
}

function caseRegionOptions() {
  const items = [...(state.data.labs ?? []), ...(state.data.people ?? [])];
  return [...new Set(items.flatMap((item) => [item.region, item.country, item.currentInstitution?.includes("Hong Kong") ? "Hong Kong" : ""]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
    .map((value) => [value, value]);
}

function caseTopicOptions() {
  const topics = new Set();
  for (const item of [...(state.data.labs ?? []), ...(state.data.people ?? [])]) {
    for (const tag of item.fieldTags ?? []) topics.add(tag);
  }
  return [...topics].sort().slice(0, 80).map((topic) => [topic, topic]);
}

function keywordOptions() {
  const keywords = new Set();
  for (const job of state.data.jobs ?? []) {
    for (const keyword of [...(job.matchedKeywords ?? []), ...(job.keywords ?? [])]) {
      keywords.add(keyword);
    }
  }
  return [...keywords].sort().slice(0, 80).map((keyword) => [keyword, keyword]);
}

function stageOptions() {
  return ["未看", "已看", "收藏", "准备联系", "已联系", "准备申请", "已申请", "归档"].map((item) => [item, item]);
}

function calendarTabButton(id, label) {
  return `<button class="segment ${state.calendarTab === id ? "active" : ""}" data-calendar-tab="${escapeAttr(id)}">${escapeHtml(label)}</button>`;
}

function detailSection(title, content) {
  if (!content) return "";
  return `<section class="detail-section"><h3>${escapeHtml(title)}</h3>${content}</section>`;
}

function infoList(rows) {
  return `<dl class="info-list">${rows.filter(([, value]) => value).map(([key, value]) => {
    const rendered = value && typeof value === "object" && value.html ? value.html : escapeHtml(value ?? "");
    return `<div><dt>${escapeHtml(key)}</dt><dd>${rendered}</dd></div>`;
  }).join("")}</dl>`;
}

function reasonList(title, values = []) {
  const list = values.filter(Boolean);
  if (!list.length) return `<p class="muted">${escapeHtml(title)}待补充。</p>`;
  return `<div><strong>${escapeHtml(title)}</strong><ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
}

function routeColumn(title, values = []) {
  return `<div>${reasonList(title, values)}</div>`;
}

function routeJobs(route, limit = 4) {
  const regions = new Set(route.regions ?? []);
  const roleTypes = new Set(route.roleTypes ?? []);
  return [...(state.data.jobs ?? [])]
    .filter((job) => job.recordType !== "watch_seed")
    .filter((job) => (!regions.size || regions.has(job.region)) && (!roleTypes.size || roleTypes.has(job.roleType)))
    .sort(compareJobs)
    .slice(0, limit);
}

function routePeople(route, limit = 3) {
  return sortedPeople()
    .filter((person) => personMatchesRoute(person, route))
    .slice(0, limit);
}

function personMatchesRoute(person, route) {
  const personHaystack = [
    person.currentRoleType,
    person.currentPosition,
    person.currentInstitution,
    ...(person.fieldTags ?? [])
  ].join(" ").toLowerCase();
  if ((route.regions ?? []).some((region) => personHaystack.includes(String(region).toLowerCase()))) return true;
  return (person.fieldTags ?? []).some((tag) => routeText(route).includes(String(tag).toLowerCase()));
}

function routeText(route) {
  return [
    route.titleZh,
    route.fitZh,
    ...(route.timelineZh ?? []),
    ...(route.preparationZh ?? []),
    ...(route.risksZh ?? []),
    ...(route.nextActionsZh ?? [])
  ].join(" ").toLowerCase();
}

function linkedJobList(title, jobs) {
  return `
    <div class="linked-block">
      <strong>${escapeHtml(title)}</strong>
      ${jobs.length ? `<div class="linked-list">${jobs.map((job) => `
        <button class="linked-row" data-job-id="${escapeAttr(job.id)}">
          ${scoreBadge(job)}
          <span>
            <b>${escapeHtml(job.title)}</b>
            <small>${escapeHtml([job.institution || job.sourceName, job.region, job.roleLabelZh].filter(Boolean).join(" · "))}</small>
          </span>
        </button>
      `).join("")}</div>` : `<p class="muted">暂无匹配代表机会。</p>`}
    </div>
  `;
}

function linkedPersonList(title, people) {
  return `
    <div class="linked-block">
      <strong>${escapeHtml(title)}</strong>
      ${people.length ? `<div class="linked-list">${people.map((person) => `
        <button class="linked-row" data-person-id="${escapeAttr(person.id)}">
          <span class="trust-label">${escapeHtml(person.priority ?? "P?")}</span>
          <span>
            <b>${escapeHtml(person.name)}</b>
            <small>${escapeHtml([person.currentPosition, person.currentInstitution].filter(Boolean).join(" · "))}</small>
          </span>
        </button>
      `).join("")}</div>` : `<p class="muted">案例库仍在补充。</p>`}
    </div>
  `;
}

function renderRelatedPeople(job) {
  const people = relatedPeopleForJob(job);
  if (!people.length) {
    return `<p class="muted">暂无直接关联人物。后续会从 PI、课题组和公开入职路径中补充。</p>`;
  }
  return linkedPersonList("可参考人物", people);
}

function relatedPeopleForJob(job) {
  const jobTerms = new Set([
    job.region,
    job.country,
    job.roleType,
    job.roleLabelZh,
    ...(job.matchedKeywords ?? []),
    ...(job.keywords ?? [])
  ].filter(Boolean).map((item) => String(item).toLowerCase()));
  return sortedPeople()
    .map((person) => {
      const personTerms = [
        person.currentRoleType,
        person.currentPosition,
        person.currentInstitution,
        ...(person.fieldTags ?? [])
      ].filter(Boolean).map((item) => String(item).toLowerCase());
      const overlap = personTerms.filter((term) => [...jobTerms].some((jobTerm) => jobTerm.includes(term) || term.includes(jobTerm))).length;
      return { person, overlap };
    })
    .filter((item) => item.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 4)
    .map((item) => item.person);
}

function renderPersonTimeline(person) {
  const steps = [
    ["PhD", [person.phdInstitution, person.phdYear].filter(Boolean).join(" · ")],
    ["Postdoc / Research Fellow", (person.postdocHistory ?? []).map((item) => `${item.institution} ${item.years ?? ""}`).join("；")],
    ["当前岗位", [person.currentPosition, person.currentInstitution].filter(Boolean).join(" · ")],
    ["公开证据", evidenceSummary(person)]
  ].filter(([, value]) => value);
  if (!steps.length) return `<p class="muted">公开路线信息待补充。</p>`;
  return `<ol class="path-timeline">${steps.map(([label, value]) => `<li><span>${escapeHtml(label)}</span><p>${escapeHtml(value)}</p></li>`).join("")}</ol>`;
}

function evidenceSummary(person) {
  const evidence = person.evidence ?? [];
  if (!evidence.length) return "";
  return evidence.map((item) => `${item.type ?? "source"} · ${item.confidence ?? "待核验"}`).join("；");
}

function renderPrivateJobState(job) {
  const privateState = job.private;
  if (!privateState) return `<p class="muted">暂无个人行动记录。</p>`;
  return infoList([
    ["我的阶段", privateState.myStage],
    ["我的优先级", privateState.myPriority],
    ["私人备注", privateState.privateNotes],
    ["材料状态", privateState.materialStatus],
    ["申请系统", privateState.applicationSystemStatus],
    ["提醒时间", privateState.reminderAt],
    ["归档原因", privateState.archiveReason]
  ]);
}

function scoreBadge(job) {
  return `<span class="score-badge grade-${escapeAttr((job.priority || "d").toLowerCase())}">${escapeHtml(job.priority || "D")} ${Number(job.matchScore ?? 0)}</span>`;
}

function labBadge(lab) {
  return `<span class="score-badge grade-${escapeAttr(String(lab.matchLevel || "c").toLowerCase())}">${escapeHtml(lab.matchLevel || "C")} ${Number(lab.matchScore ?? 0)}</span>`;
}

function renderWorks(works = []) {
  const list = works.filter((work) => work?.title);
  if (!list.length) return `<p class="muted">代表作待补充。</p>`;
  return `<div class="linked-list">${list.map((work) => `
    <a class="linked-row" href="${escapeAttr(work.url || "#")}" target="_blank" rel="noreferrer">
      <span class="trust-label">${escapeHtml(work.year || "work")}</span>
      <span>
        <b>${escapeHtml(work.title)}</b>
        <small>${escapeHtml(work.venue || work.note || "")}</small>
      </span>
    </a>
  `).join("")}</div>`;
}

function renderEvidence(evidence = []) {
  const list = evidence.filter((item) => item?.url);
  if (!list.length) return `<p class="muted">公开证据待补充。</p>`;
  return `<div class="linked-list">${list.map((item) => `
    <a class="linked-row" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">
      <span class="trust-label">${escapeHtml(item.confidence || "source")}</span>
      <span>
        <b>${escapeHtml(item.type || "source")}</b>
        <small>${escapeHtml(item.url)}</small>
      </span>
    </a>
  `).join("")}</div>`;
}

function tagList(values = []) {
  const unique = [...new Set(values.filter(Boolean))].slice(0, 6);
  return unique.length ? unique.map((value) => `<span class="tag">${escapeHtml(value)}</span>`).join("") : `<span class="muted">待提取</span>`;
}

function link(url, label) {
  return url ? { html: `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>` } : "";
}

function emptyBlock(text) {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

function daysUntil(dateValue) {
  if (!dateValue) return Number.POSITIVE_INFINITY;
  const date = new Date(`${dateValue}T23:59:59Z`);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function deadlineMatches(filter, days, job) {
  if (filter === "30") return days <= 30 && days >= 0;
  if (filter === "90") return days <= 90 && days >= 0;
  if (filter === "none") return !job.deadline || job.evergreen;
  return true;
}

function fieldMatches(value, filter) {
  if (!filter) return true;
  if (!value) return filter === "unknown";
  const normalized = String(value).toLowerCase();
  if (filter === "yes") return !["no", "none", "不需要"].includes(normalized);
  if (filter === "no") return ["no", "none", "不需要"].includes(normalized);
  return normalized.includes(filter.toLowerCase());
}

function formatDateTime(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}

function fallbackData() {
  return {
    mode: "public",
    copy: { title: "博后教职职业情报门户", navigation: [] },
    metadata: {},
    profile: {},
    metrics: {},
    jobs: [],
    alerts: [],
    people: [],
    labs: [],
    routes: [],
    sources: [],
    calendar: {}
  };
}
