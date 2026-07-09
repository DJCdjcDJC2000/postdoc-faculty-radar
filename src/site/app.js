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
        ${metricCard("30天内截止", metrics.dueSoonJobs ?? 0, "注意行动")}
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
  const people = sortedPeople();
  els.pages.cases.innerHTML = `
    <section class="page-heading">
      <p class="eyebrow">Career Cases</p>
      <h1>成功案例</h1>
      <p>只收录公开可验证信息。默认按方向相近度、目标地区相关度、背景路径相近度、岗位代表性和资料可信度排序。</p>
    </section>
    <section class="person-grid">
      ${people.length ? people.map(personCard).join("") : emptyBlock("案例库待补充公开可验证样本")}
    </section>
  `;
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

function showPersonDetail(personId) {
  const person = state.data.people.find((item) => item.id === personId);
  if (!person) return;
  els.drawer.classList.add("open");
  els.drawer.innerHTML = `
    <button class="drawer-close" data-close-drawer aria-label="关闭">×</button>
    <div class="drawer-body">
      <p class="eyebrow">成功案例</p>
      <h2>${escapeHtml(person.name)}</h2>
      <p class="muted">${escapeHtml(person.currentPosition || "")} · ${escapeHtml(person.currentInstitution || "")}</p>
      ${detailSection("职业路径摘要", `<p>${escapeHtml(person.ai?.careerPathZh ?? person.pathSummaryZh ?? "")}</p>`)}
      ${detailSection("背景表格", infoList([
        ["PhD 机构", person.phdInstitution],
        ["PhD 年份", person.phdYear],
        ["导师", person.advisor],
        ["Postdoc 经历", (person.postdocHistory ?? []).map((item) => `${item.institution} ${item.years ?? ""}`).join("；")],
        ["当前岗位类型", person.currentRoleType],
        ["可信度", person.confidence],
        ["公开主页", link(person.homepage, "打开主页")]
      ]))}
      ${detailSection("研究方向", tagList(person.fieldTags ?? []))}
      ${detailSection("可学习点", reasonList("可学习点", person.ai?.learningsZh ?? person.learningsZh ?? []))}
      ${detailSection("风险提醒", reasonList("不可简单复制", person.ai?.risksZh ?? person.risksZh ?? []))}
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
      <button class="inline-button" data-person-id="${escapeAttr(person.id)}">查看路径</button>
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

function optionsFrom(items, key, labelKey = key) {
  return [...new Map((items ?? []).filter((item) => item[key]).map((item) => [item[key], item[labelKey] ?? item[key]]))].sort((a, b) => String(a[1]).localeCompare(String(b[1]), "zh-CN"));
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
    routes: [],
    sources: [],
    calendar: {}
  };
}
