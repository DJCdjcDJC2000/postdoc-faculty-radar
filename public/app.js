const PEOPLE_TABS = [
  ["overview", "总览"],
  ["mentors", "导师课题组"],
  ["young", "青年学者"],
  ["industry", "产业人物入口"],
  ["compare", "横向对比"],
  ["network", "关系网络"]
];

const ACADEMIC_PROFILE_TYPES = {
  mentor_group: "导师课题组",
  young_scholar: "青年学者",
  academic_reference: "学术参照"
};

const RECRUITMENT_SIGNAL_PRESENTATION = {
  official_opening: { label: "官方明确招聘", note: "可视为公开开放岗位", mark: "招", className: "signal-official" },
  funded_expansion_signal: { label: "基金或项目扩组", note: "扩组线索，不等于公开招聘", mark: "项", className: "signal-funded" },
  accepts_applications: { label: "长期接受申请", note: "长期申请通道，不等于公开招聘", mark: "长", className: "signal-accepts" },
  fellowship_host: { label: "Fellowship host", note: "需经 Fellowship 项目申请", mark: "F", className: "signal-fellowship" },
  department_opening: { label: "院系招聘通道", note: "院系层面机会，需核对具体导师", mark: "院", className: "signal-department" },
  no_public_signal: { label: "暂无公开招聘证据", note: "仅表示未发现公开信号", mark: "无", className: "signal-none" },
  closed_or_expired: { label: "已截止或明确不招", note: "历史信号，不应视为开放", mark: "止", className: "signal-closed" }
};

const state = {
  data: null,
  view: "home",
  radarFilters: {
    search: "",
    region: "",
    roleType: "",
    topic: "",
    priority: "",
    freshness: "",
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
  selectedIndustryOpportunityId: null,
  selectedIndustryCompanyId: null,
  selectedIndustryPersonId: null,
  industryFilters: {
    search: "",
    region: "",
    category: "",
    roleFamily: "",
    timing: "",
    status: ""
  },
  companyCompare: new Set(),
  opportunityCompare: new Set(),
  industryExpanded: {
    opportunities: false,
    companies: false,
    people: false,
    paths: false
  },
  caseFilters: {
    search: "",
    region: "",
    type: "",
    topic: "",
    recruitment: ""
  },
  calendarTab: "fellowships",
  peopleTab: "overview",
  peopleView: "table",
  peopleFilters: {
    search: "",
    type: "",
    region: "",
    research: "",
    recruitment: "",
    quality: ""
  },
  peopleCompare: new Set(),
  peopleMessage: "",
  selectedAcademicProfileId: null
};

const els = {
  nav: document.querySelector("#main-nav"),
  modePill: document.querySelector("#mode-pill"),
  drawer: document.querySelector("#detail-drawer"),
  pages: {
    home: document.querySelector("#page-home"),
    radar: document.querySelector("#page-radar"),
    industry: document.querySelector("#page-industry"),
    routes: document.querySelector("#page-routes"),
    people: document.querySelector("#page-people"),
    profile: document.querySelector("#page-profile"),
    cases: document.querySelector("#page-cases"),
    calendar: document.querySelector("#page-calendar"),
    methods: document.querySelector("#page-methods")
  }
};

await init();

async function init() {
  state.data = await fetchJson("./data/site.json", fallbackData());
  renderShell();
  renderAll();
  bindGlobalEvents();
  setView(location.hash?.replace("#", "") || "home");
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
    const peopleTab = event.target.closest("[data-people-tab]");
    if (peopleTab) {
      state.peopleTab = peopleTab.dataset.peopleTab;
      if (state.peopleTab === "mentors") state.peopleFilters.type = "mentor_group";
      if (state.peopleTab === "young") state.peopleFilters.type = "young_scholar";
      if (["overview", "industry", "compare", "network"].includes(state.peopleTab)) state.peopleFilters.type = "";
      renderPeople();
      return;
    }
    const peopleView = event.target.closest("[data-people-view]");
    if (peopleView) {
      state.peopleView = peopleView.dataset.peopleView;
      renderPeopleContent();
      return;
    }
    const academicCompare = event.target.closest("[data-academic-compare-id]");
    if (academicCompare) {
      toggleAcademicComparison(academicCompare.dataset.academicCompareId);
      renderPeopleContent();
      return;
    }
    const removeAcademicCompare = event.target.closest("[data-remove-academic-compare]");
    if (removeAcademicCompare) {
      state.peopleCompare.delete(removeAcademicCompare.dataset.removeAcademicCompare);
      renderPeopleContent();
      return;
    }
    if (event.target.closest("[data-clear-people-compare]")) {
      state.peopleCompare.clear();
      state.peopleMessage = "";
      renderPeopleContent();
      return;
    }
    if (event.target.closest("[data-clear-people-filters]")) {
      Object.keys(state.peopleFilters).forEach((key) => { state.peopleFilters[key] = ""; });
      state.peopleTab = "overview";
      renderPeople();
      return;
    }
    if (event.target.closest("[data-print-profile]")) {
      window.print();
      return;
    }
    if (event.target.closest("[data-export-profile]")) {
      exportAcademicProfile();
      return;
    }
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
    const industryOpportunityButton = event.target.closest("[data-industry-opportunity-id]");
    if (industryOpportunityButton) {
      showIndustryOpportunityDetail(industryOpportunityButton.dataset.industryOpportunityId);
      return;
    }
    const industryCompanyButton = event.target.closest("[data-industry-company-id]");
    if (industryCompanyButton) {
      showIndustryCompanyDetail(industryCompanyButton.dataset.industryCompanyId);
      return;
    }
    const industryPersonButton = event.target.closest("[data-industry-person-id]");
    if (industryPersonButton) {
      showIndustryPersonDetail(industryPersonButton.dataset.industryPersonId);
      return;
    }
    const compareCompanyButton = event.target.closest("[data-compare-company-id]");
    if (compareCompanyButton) {
      toggleComparison(state.companyCompare, compareCompanyButton.dataset.compareCompanyId);
      renderIndustry();
      renderHome();
      return;
    }
    const compareOpportunityButton = event.target.closest("[data-compare-opportunity-id]");
    if (compareOpportunityButton) {
      toggleComparison(state.opportunityCompare, compareOpportunityButton.dataset.compareOpportunityId);
      renderIndustry();
      renderHome();
      return;
    }
    if (event.target.closest("[data-clear-industry-compare]")) {
      state.companyCompare.clear();
      state.opportunityCompare.clear();
      renderIndustry();
      return;
    }
    const expandIndustryButton = event.target.closest("[data-expand-industry]");
    if (expandIndustryButton) {
      const key = expandIndustryButton.dataset.expandIndustry;
      state.industryExpanded[key] = !state.industryExpanded[key];
      renderIndustry();
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
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });
}

function renderAll() {
  renderHome();
  renderRadar();
  renderIndustry();
  renderRoutes();
  renderPeople();
  renderCases();
  renderCalendar();
  renderMethods();
}

function setView(view) {
  const route = parseSiteRoute(view);
  const safeView = route.profileId ? "profile" : (els.pages[route.view] ? route.view : "home");
  state.selectedAcademicProfileId = route.profileId;
  state.view = safeView;
  if (safeView === "profile") renderAcademicProfile();
  Object.entries(els.pages).forEach(([id, node]) => node.classList.toggle("active", id === safeView));
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === (safeView === "profile" ? "people" : safeView)));
  closeDrawer();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function parseSiteRoute(value) {
  const normalized = String(value || "home").replace(/^#/, "");
  const [view, ...rest] = normalized.split("/");
  if (view !== "people" || !rest.length) return { view };
  try {
    return { view: "people", profileId: decodeURIComponent(rest.join("/")) };
  } catch {
    return { view: "people", profileId: rest.join("/") };
  }
}

function renderHome() {
  const { data } = state;
  const metrics = data.metrics ?? {};
  const featuredJobs = highMatchJobs().slice(0, 6);
  const featuredLabs = sortedLabs().slice(0, 4);
  const featuredPeople = sortedPeople().slice(0, 3);
  const featuredIndustryOpportunities = sortedIndustryOpportunities().slice(0, 3);
  const featuredIndustryCompanies = sortedIndustryCompanies().slice(0, 3);
  const activeSources = (data.sources ?? []).filter((source) => source.status === "ok").slice(0, 6);

  els.pages.home.innerHTML = `
    <section class="hero-band">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(data.copy?.tagline ?? "官方优先、公开可证")}</p>
        <h1>${escapeHtml(data.copy?.title ?? "博后教职职业情报门户")}</h1>
        <p class="lead">${escapeHtml(data.copy?.subtitle ?? "")}</p>
      </div>
      <div class="briefing-strip" aria-label="本周情报摘要">
        ${metricCard("本周新增", data.updates?.newCount ?? metrics.newJobs ?? 0, `更新 ${data.updates?.updatedCount ?? metrics.updatedJobs ?? 0}`)}
        ${metricCard("A/B 高匹配", metrics.highMatchJobs ?? 0, "优先查看")}
        ${metricCard("目标课题组", metrics.targetLabs ?? 0, "导师/PI 雷达")}
        ${metricCard("活跃数据源", `${metrics.activeSources ?? 0}/${metrics.totalSources ?? 0}`, "最近抓取")}
      </div>
    </section>

    ${renderWeeklyUpdates(data.updates)}

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

    <section class="section-band industry-home-band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Industry Radar</p>
          <h2>大陆大厂优先的产业机会</h2>
        </div>
        <a href="#industry" class="text-link">进入产业雷达</a>
      </div>
      <div class="industry-home-grid">
        <div class="industry-opportunity-list">
          ${featuredIndustryOpportunities.map(industryOpportunityRow).join("") || emptyBlock("产业岗位待补充")}
        </div>
        <div class="company-rank-list">
          ${featuredIndustryCompanies.map(industryCompanyRankRow).join("") || emptyBlock("重点公司待补充")}
        </div>
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
      ${filterSelect("freshness", "更新状态", [["new", "本周新增"], ["updated", "本周更新"], ["active", "当前有效"], ["expired", "已失效/已截止"]])}
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
              <th>状态</th>
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
  body.innerHTML = jobs.length ? jobs.map(jobRow).join("") : `<tr><td colspan="11">${emptyBlock("没有匹配当前筛选的机会")}</td></tr>`;
}

function renderIndustry() {
  const industry = state.data.industry ?? fallbackIndustry();
  const opportunities = filteredIndustryOpportunities();
  const companies = filteredIndustryCompanies();
  const people = filteredIndustryPeople();
  const paths = industry.anonymousPaths ?? [];
  const visibleOpportunities = state.industryExpanded.opportunities ? opportunities : opportunities.slice(0, 12);
  const visibleCompanies = state.industryExpanded.companies ? companies : companies.slice(0, 12);
  const visiblePeople = state.industryExpanded.people ? people : people.slice(0, 12);
  const visiblePaths = state.industryExpanded.paths ? paths : paths.slice(0, 8);
  const activeCount = (industry.opportunities ?? []).filter((item) => item.status === "active").length;
  const internshipCount = (industry.opportunities ?? []).filter((item) => String(item.track).includes("internship")).length;
  const highFeasibilityCount = (industry.opportunities ?? []).filter((item) => Number(item.feasibilityScore ?? 0) >= 70).length;

  els.pages.industry.innerHTML = `
    <section class="page-heading industry-heading">
      <p class="eyebrow">Industry Intelligence</p>
      <h1>产业雷达</h1>
      <p>大陆大厂工作优先，港新与欧洲产业研究并行；核心优化、邻近转型和量化备选分层展示。岗位是否开放、薪资和身份要求均以原始来源为准。</p>
      <div class="industry-update-line">
        <span>资料更新 ${escapeHtml(industry.updatedAt || "待补")}</span>
        <span>官方优先</span>
        <span>周更计划</span>
      </div>
    </section>

    <section class="industry-metric-strip" aria-label="产业雷达摘要">
      ${metricCard("当前招聘信号", activeCount, "含未来目标样本")}
      ${metricCard("重点公司", industry.companies?.length ?? 0, "公司 → 团队 → 岗位")}
      ${metricCard("产业人物", industry.people?.length ?? 0, "实名公开路径")}
      ${metricCard("实习入口", internshipCount, "2028 暑期准备")}
      ${metricCard("较高可行性", highFeasibilityCount, "可行性 ≥ 70")}
    </section>

    <section class="filter-band industry-filter-band">
      ${industryFilterInput("search", "搜索", "供应链、量化、华为、C++")}
      ${industryFilterSelect("region", "地区", industryRegionOptions())}
      ${industryFilterSelect("category", "公司类型", industryCategoryOptions())}
      ${industryFilterSelect("roleFamily", "岗位方向", industryRoleOptions())}
      ${industryFilterSelect("timing", "时间适配", [["future_action", "未来可行动"], ["future_sample", "目标岗位样本"]])}
      ${industryFilterSelect("status", "状态", [["active", "招聘信号活跃"], ["watch", "长期监控"], ["historical", "历史样本"]])}
    </section>

    ${renderIndustryComparePanel()}

    <section class="section-band">
      <div class="section-head">
        <div>
          <p class="eyebrow">01 · Opportunities</p>
          <h2>当前招聘与未来目标岗位</h2>
        </div>
        <span class="muted">${opportunities.length} 条 · 研究相关性为准入门槛</span>
      </div>
      <div class="industry-opportunity-list full">
        ${visibleOpportunities.length ? visibleOpportunities.map(industryOpportunityRow).join("") : emptyBlock("当前筛选下没有岗位")}
      </div>
      ${industryExpandButton("opportunities", visibleOpportunities.length, opportunities.length)}
    </section>

    <section class="section-band">
      <div class="section-head">
        <div>
          <p class="eyebrow">02 · Company Ranking</p>
          <h2>重点公司与团队</h2>
        </div>
        <span class="muted">供给 25% · 薪资 25% · 可行性 20% · 匹配 15%</span>
      </div>
      <div class="industry-company-grid">
        ${visibleCompanies.length ? visibleCompanies.map(industryCompanyCard).join("") : emptyBlock("当前筛选下没有公司")}
      </div>
      ${industryExpandButton("companies", visibleCompanies.length, companies.length)}
    </section>

    <section class="section-band">
      <div class="section-head">
        <div>
          <p class="eyebrow">03 · Compensation</p>
          <h2>薪资与购买力参考</h2>
        </div>
        <span class="muted">非 Offer 预测 · 按年份与置信度核验</span>
      </div>
      <div class="salary-table-wrap">
        <table class="salary-table">
          <thead><tr><th>路线</th><th>原币种区间</th><th>人民币参考</th><th>购买力</th><th>证据</th></tr></thead>
          <tbody>${(industry.salaryBenchmarks ?? []).map(salaryBenchmarkRow).join("")}</tbody>
        </table>
      </div>
    </section>

    <section class="section-band">
      <div class="section-head">
        <div>
          <p class="eyebrow">04 · People</p>
          <h2>产业人物与成长路径</h2>
        </div>
        <span class="muted">优先展示可复制性较高的青年路径</span>
      </div>
      <div class="industry-person-grid">
        ${visiblePeople.length ? visiblePeople.map(industryPersonCard).join("") : emptyBlock("当前筛选下没有人物")}
      </div>
      ${industryExpandButton("people", visiblePeople.length, people.length)}
    </section>

    <section class="section-band industry-skill-band">
      <div class="section-head">
        <div>
          <p class="eyebrow">05 · Skill Demand</p>
          <h2>岗位反复出现的能力</h2>
        </div>
        <span class="muted">基于首批岗位样本，后续周更</span>
      </div>
      <div class="skill-demand-list">
        ${(industry.skillDemand ?? []).map(industrySkillRow).join("")}
      </div>
    </section>

    ${state.data.mode === "private" ? renderIndustryPrivateGap(industry.private) : renderPublicGapNotice()}

    <section class="section-band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Path Samples</p>
          <h2>匿名成长路径样本</h2>
        </div>
        <span class="muted">不与实名人物排名混排</span>
      </div>
      <div class="anonymous-path-grid">
        ${visiblePaths.map(anonymousPathCard).join("")}
      </div>
      ${industryExpandButton("paths", visiblePaths.length, paths.length)}
    </section>

    <section class="method-note-band">
      <strong>数据边界</strong>
      <p>${escapeHtml(industry.sourcePolicyZh || "所有申请前必须回到官方原始链接核验。")}</p>
    </section>
  `;

  els.pages.industry.querySelectorAll("[data-industry-filter]").forEach((control) => {
    control.addEventListener("input", (event) => {
      state.industryFilters[event.target.dataset.industryFilter] = event.target.value;
      renderIndustry();
    });
  });
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

function renderPeople() {
  const academic = academicData();
  const overview = academic.overview ?? {};
  els.pages.people.innerHTML = `
    <section class="page-heading people-heading">
      <p class="eyebrow">Academic People Intelligence</p>
      <h1>学术人物</h1>
      <p>以公开身份、书目数据和原始证据为边界，统一呈现导师课题组、青年学者与学术参照。招聘信号按证据强度分型，不把基金扩组、长期申请或 Fellowship host 误写成公开岗位。</p>
      <div class="people-update-line">
        <span>Schema ${Number(academic.schemaVersion ?? 0) || "待生成"}</span>
        <span>指标更新 ${escapeHtml(formatShortDate(overview.metricsUpdatedAt) || "待补充")}</span>
        <span>公开证据优先</span>
      </div>
    </section>

    <section class="people-overview-strip" aria-label="学术人物总览">
      ${peopleMetric("人物档案", overview.totalProfiles ?? academic.profiles.length, "当前收录")}
      ${peopleMetric("资料完整", overview.readyProfiles ?? 0, "通过质量门槛")}
      ${peopleMetric("资料待完善", overview.incompleteProfiles ?? 0, "缺项有标记")}
      ${peopleMetric("官方招聘", overview.officialOpenings ?? 0, "公开开放岗位")}
      ${peopleMetric("基金扩组", overview.expansionSignals ?? 0, "不等于招聘")}
      ${peopleMetric("Fellowship host", overview.fellowshipHosts ?? 0, "项目申请路线")}
    </section>

    <nav class="people-tabs" aria-label="学术人物视图">
      ${PEOPLE_TABS.map(([id, label]) => `<button class="people-tab ${state.peopleTab === id ? "active" : ""}" data-people-tab="${escapeAttr(id)}" aria-pressed="${state.peopleTab === id}">${escapeHtml(label)}</button>`).join("")}
    </nav>

    <section class="people-filter-shell" aria-label="学术人物筛选">
      <div class="people-filter-grid">
        ${peopleFilterInput("search", "搜索", "姓名、机构、课题组、研究方向")}
        ${peopleFilterSelect("type", "类型", academicTypeOptions())}
        ${peopleFilterSelect("region", "地区", academicRegionOptions())}
        ${peopleFilterSelect("research", "研究方向", academicResearchOptions())}
        ${peopleFilterSelect("recruitment", "招聘信号", academicRecruitmentOptions())}
        ${peopleFilterSelect("quality", "质量状态", [["ready", "资料完整"], ["incomplete", "资料待完善"]])}
      </div>
      <div class="people-toolbar">
        <div class="people-result-meta">
          <strong id="people-results-count">0 人</strong>
          <span id="people-compare-count">已选 ${state.peopleCompare.size}/5</span>
          <span class="people-feedback" id="people-feedback" role="status" aria-live="polite"></span>
        </div>
        <div class="people-toolbar-actions">
          <button class="tiny-button" data-clear-people-filters>清除筛选</button>
          <div class="view-segmented" aria-label="列表布局">
            <button class="view-option ${state.peopleView === "table" ? "active" : ""}" data-people-view="table" aria-pressed="${state.peopleView === "table"}">表格</button>
            <button class="view-option ${state.peopleView === "cards" ? "active" : ""}" data-people-view="cards" aria-pressed="${state.peopleView === "cards"}">卡片</button>
          </div>
        </div>
      </div>
    </section>

    <section class="people-content" id="people-content"></section>
  `;

  els.pages.people.querySelectorAll("[data-people-filter]").forEach((control) => {
    control.addEventListener("input", (event) => {
      state.peopleFilters[event.target.dataset.peopleFilter] = event.target.value;
      if (event.target.dataset.peopleFilter === "type") {
        state.peopleTab = event.target.value === "mentor_group" ? "mentors" : event.target.value === "young_scholar" ? "young" : "overview";
        els.pages.people.querySelectorAll("[data-people-tab]").forEach((tab) => {
          tab.classList.toggle("active", tab.dataset.peopleTab === state.peopleTab);
          tab.setAttribute("aria-pressed", String(tab.dataset.peopleTab === state.peopleTab));
        });
      }
      renderPeopleContent();
    });
  });
  renderPeopleContent();
}

function renderPeopleContent() {
  const container = document.querySelector("#people-content");
  if (!container) return;
  const academic = academicData();
  const profiles = filteredAcademicProfiles();
  const count = document.querySelector("#people-results-count");
  const compareCount = document.querySelector("#people-compare-count");
  const feedback = document.querySelector("#people-feedback");
  if (count) count.textContent = `${profiles.length} 人`;
  if (compareCount) compareCount.textContent = `已选 ${state.peopleCompare.size}/5`;
  if (feedback) feedback.textContent = state.peopleMessage;

  if (Number(academic.schemaVersion) !== 2) {
    container.innerHTML = professionalEmpty("学术人物数据尚未生成", "请在 schemaVersion 2 数据完成构建后重新查看。", "数据状态");
    return;
  }
  if (state.peopleTab === "industry") {
    container.innerHTML = renderIndustryPeopleEntry();
    return;
  }
  if (state.peopleTab === "compare") {
    container.innerHTML = renderAcademicComparison();
    return;
  }
  if (state.peopleTab === "network") {
    container.innerHTML = renderAcademicNetwork(profiles);
    return;
  }

  const overview = state.peopleTab === "overview" ? renderAcademicOverviewPanels(academic) : "";
  container.innerHTML = `${overview}${renderAcademicPeopleList(profiles)}`;
}

function renderAcademicOverviewPanels(academic) {
  const overview = academic.overview ?? {};
  const tags = overview.topResearchTags ?? [];
  const maxTagCount = Math.max(...tags.map((item) => Number(item.count ?? 0)), 1);
  return `
    <div class="academic-overview-ledger">
      <section class="overview-ledger-section">
        <div class="ledger-heading"><div><p class="eyebrow">Research Map</p><h2>高频研究方向</h2></div><span>按档案标签计数</span></div>
        ${tags.length ? `<div class="research-frequency-list">${tags.slice(0, 10).map((item) => `
          <div class="research-frequency-row"><span>${escapeHtml(item.value)}</span><i><b style="width:${Math.max(4, Number(item.count ?? 0) / maxTagCount * 100)}%"></b></i><strong>${Number(item.count ?? 0)}</strong></div>
        `).join("")}</div>` : professionalEmpty("研究方向尚待汇总", "档案补充研究标签后将在这里形成分布。", "研究数据")}
      </section>
      <section class="overview-ledger-section signal-ledger-section">
        <div class="ledger-heading"><div><p class="eyebrow">Signal Taxonomy</p><h2>招聘信号口径</h2></div><span>七类证据严格分开</span></div>
        <div class="signal-ledger">${academicRecruitmentTypes().map((type) => renderRecruitmentSignal({ type: type.id, labelZh: type.labelZh }, true)).join("")}</div>
      </section>
    </div>
  `;
}

function renderAcademicPeopleList(profiles) {
  if (!profiles.length) {
    return professionalEmpty("没有符合当前条件的人物档案", "可调整类型、地区、方向、招聘信号或质量状态后重新查看。", "筛选结果");
  }
  const cards = `<div class="academic-card-grid ${state.peopleView === "table" ? "people-mobile-list" : ""}">${profiles.map(academicProfileCard).join("")}</div>`;
  if (state.peopleView === "cards") return cards;
  return `
    <div class="people-table-wrap">
      <table class="people-table">
        <thead><tr><th>人物 / 机构</th><th>类型</th><th>地区</th><th>研究方向</th><th>论文指标</th><th>招聘信号</th><th>质量</th><th>更新</th><th>对比</th></tr></thead>
        <tbody>${profiles.map(academicProfileRow).join("")}</tbody>
      </table>
    </div>
    ${cards}
  `;
}

function academicProfileRow(profile) {
  const selected = state.peopleCompare.has(profile.id);
  const metrics = profile.publicationMetrics ?? {};
  return `<tr>
    <td><a class="academic-name-link" href="#people/${encodeURIComponent(profile.id)}">${escapeHtml(profileDisplayName(profile))}</a><small>${escapeHtml([profile.currentPosition, profile.institution, profile.department].filter(Boolean).join(" · "))}</small></td>
    <td>${profileTypeBadge(profile.profileType)}</td>
    <td>${escapeHtml([profile.region, profile.country].filter(Boolean).join(" / ") || "待补充")}</td>
    <td><div class="academic-tag-list">${academicTags(profile.research?.tags)}</div></td>
    <td><span class="metric-pair"><b>${formatMetric(metrics.worksCount)}</b> 收录成果</span><span class="metric-pair"><b>${formatMetric(metrics.recentWorksCount)}</b> 近 5 年</span></td>
    <td><div class="table-signal-list">${(profile.recruitmentSignals ?? []).slice(0, 2).map((signal) => renderRecruitmentSignal(signal, true)).join("") || `<span class="muted">待补充</span>`}</div></td>
    <td>${qualityBadge(profile.quality)}</td>
    <td>${escapeHtml(profileUpdatedAt(profile) || "待补充")}</td>
    <td>${academicCompareControl(profile, selected)}</td>
  </tr>`;
}

function academicProfileCard(profile) {
  const selected = state.peopleCompare.has(profile.id);
  const metrics = profile.publicationMetrics ?? {};
  return `<article class="academic-profile-card">
    <div class="academic-card-top">${profileTypeBadge(profile.profileType)}${qualityBadge(profile.quality)}</div>
    <h3><a href="#people/${encodeURIComponent(profile.id)}">${escapeHtml(profileDisplayName(profile))}</a></h3>
    <p class="academic-role">${escapeHtml(profile.currentPosition || "职务待补充")}</p>
    <p class="academic-affiliation">${escapeHtml([profile.institution, profile.department].filter(Boolean).join(" · ") || "机构待补充")}</p>
    <div class="academic-tag-list">${academicTags(profile.research?.tags)}</div>
    <div class="academic-card-metrics"><span><b>${formatMetric(metrics.worksCount)}</b> 收录成果</span><span><b>${formatMetric(metrics.recentWorksCount)}</b> 近 5 年</span><span><b>${profile.representativeWorks?.length ?? 0}</b> 代表作</span></div>
    <div class="academic-card-signals">${(profile.recruitmentSignals ?? []).slice(0, 2).map((signal) => renderRecruitmentSignal(signal, true)).join("") || `<span class="muted">招聘信号待补充</span>`}</div>
    <div class="academic-card-footer"><a class="inline-button" href="#people/${encodeURIComponent(profile.id)}">查看完整档案</a>${academicCompareControl(profile, selected)}</div>
  </article>`;
}

function academicCompareControl(profile, selected) {
  const disabled = !selected && state.peopleCompare.size >= 5;
  return `<label class="compare-check ${disabled ? "is-disabled" : ""}"><input type="checkbox" data-academic-compare-id="${escapeAttr(profile.id)}" ${selected ? "checked" : ""} ${disabled ? "disabled" : ""}><span>对比</span></label>`;
}

function renderAcademicComparison() {
  const profiles = [...state.peopleCompare]
    .map((id) => academicProfiles().find((profile) => profile.id === id))
    .filter(Boolean);
  if (!profiles.length) {
    return professionalEmpty("尚未选择对比人物", "可在总览、导师课题组或青年学者列表中选择最多 5 人。", "横向对比");
  }
  return `
    <section class="academic-comparison">
      <div class="comparison-heading"><div><p class="eyebrow">Side-by-side</p><h2>横向对比</h2><p>同口径比较公开学术事实；缺失数据统一显示为“待补充”。</p></div><button class="tiny-button" data-clear-people-compare>清空对比</button></div>
      <div class="academic-compare-grid" style="--people-compare-count:${profiles.length}">${profiles.map(compareAcademicProfile).join("")}</div>
    </section>
  `;
}

function compareAcademicProfile(profile) {
  const metrics = profile.publicationMetrics ?? {};
  const topVenues = (profile.venueBreakdown ?? []).slice(0, 4);
  return `<article class="academic-compare-column">
    <button class="compare-remove" data-remove-academic-compare="${escapeAttr(profile.id)}" aria-label="从对比中移除 ${escapeAttr(profileDisplayName(profile))}">移除</button>
    <h3><a href="#people/${encodeURIComponent(profile.id)}">${escapeHtml(profileDisplayName(profile))}</a></h3>
    <p>${escapeHtml([profile.currentPosition, profile.institution].filter(Boolean).join(" · ") || "任职信息待补充")}</p>
    <dl>
      <div><dt>类型</dt><dd>${escapeHtml(academicProfileTypeLabel(profile.profileType))}</dd></div>
      <div><dt>地区</dt><dd>${escapeHtml([profile.region, profile.country].filter(Boolean).join(" / ") || "待补充")}</dd></div>
      <div><dt>收录成果</dt><dd>${formatMetric(metrics.worksCount)}</dd></div>
      <div><dt>近 5 年论文</dt><dd>${formatMetric(metrics.recentWorksCount)}</dd></div>
      <div><dt>总引用</dt><dd>${formatMetric(metrics.citedByCount ?? metrics.citationCount)}</dd></div>
      <div><dt>h-index</dt><dd>${formatMetric(metrics.hIndex)}</dd></div>
      <div><dt>代表作</dt><dd>${profile.representativeWorks?.length ?? 0}</dd></div>
      <div><dt>质量</dt><dd>${escapeHtml(profile.quality?.status === "ready" ? "资料完整" : `待完善 ${profile.quality?.score ?? 0}%`)}</dd></div>
    </dl>
    <div class="compare-research"><strong>研究方向</strong><div class="academic-tag-list">${academicTags(profile.research?.tags)}</div></div>
    <div class="compare-venues"><strong>Venue 赛道</strong>${topVenues.length ? topVenues.map((item) => `<span>${escapeHtml(venueLabel(item))} · ${Number(item.count ?? 0)}</span>`).join("") : `<span>待补充</span>`}</div>
    <div class="compare-signals"><strong>招聘信号</strong>${(profile.recruitmentSignals ?? []).map((signal) => renderRecruitmentSignal(signal, true)).join("") || `<span class="muted">待补充</span>`}</div>
  </article>`;
}

function renderIndustryPeopleEntry() {
  const industry = state.data.industry ?? fallbackIndustry();
  const companies = new Set((industry.people ?? []).map((person) => person.companyId).filter(Boolean));
  return `<section class="industry-people-entry">
    <div class="industry-entry-copy"><p class="eyebrow">Industry People</p><h2>产业研究人物使用独立证据口径</h2><p>产业人物按公司、团队、公开职业路径与代表成果整理，不与学术论文档案混排。</p><a class="primary-link-button" href="#industry">进入产业人物库</a></div>
    <dl class="industry-entry-metrics"><div><dt>产业人物</dt><dd>${industry.people?.length ?? 0}</dd></div><div><dt>覆盖公司</dt><dd>${companies.size}</dd></div><div><dt>资料更新</dt><dd>${escapeHtml(formatShortDate(industry.updatedAt) || "待补充")}</dd></div></dl>
  </section>`;
}

function renderAcademicNetwork(profiles) {
  if (!profiles.length) {
    return professionalEmpty("当前筛选下没有可构建的关系网络", "调整筛选条件后可查看人物、机构与研究方向之间的公开关联。", "关系网络");
  }
  const selected = profiles.slice(0, 6);
  const institutions = [...new Set(selected.map((profile) => profile.institution).filter(Boolean))].slice(0, 5);
  const tagCounts = new Map();
  selected.forEach((profile) => (profile.research?.tags ?? []).slice(0, 4).forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)));
  const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([tag]) => tag);
  const personY = distributeNetworkNodes(selected.length);
  const institutionY = distributeNetworkNodes(institutions.length);
  const tagY = distributeNetworkNodes(tags.length);
  const edges = [];
  selected.forEach((profile, index) => {
    const institutionIndex = institutions.indexOf(profile.institution);
    if (institutionIndex >= 0) edges.push(`<line class="network-edge institution-edge" x1="210" y1="${personY[index]}" x2="500" y2="${institutionY[institutionIndex]}"></line>`);
    (profile.research?.tags ?? []).filter((tag) => tags.includes(tag)).slice(0, 2).forEach((tag) => {
      edges.push(`<line class="network-edge research-edge" x1="210" y1="${personY[index]}" x2="830" y2="${tagY[tags.indexOf(tag)]}"></line>`);
    });
  });
  return `<section class="academic-network-section">
    <div class="network-heading"><div><p class="eyebrow">Relationship Network</p><h2>人物 · 机构 · 研究方向</h2></div><span>当前筛选前 ${selected.length} 人</span></div>
    <div class="academic-network-wrap">
      <svg class="academic-network" viewBox="0 0 1040 600" role="img" aria-labelledby="network-title network-desc">
        <title id="network-title">学术人物关系网络</title><desc id="network-desc">连接人物、任职机构和高频研究方向的公开关系图。</desc>
        <text class="network-column-label" x="130" y="28">人物</text><text class="network-column-label" x="500" y="28">机构</text><text class="network-column-label" x="900" y="28">研究方向</text>
        ${edges.join("")}
        ${selected.map((profile, index) => `<a href="#people/${encodeURIComponent(profile.id)}" class="network-person-node"><circle cx="130" cy="${personY[index]}" r="46"></circle><text x="130" y="${personY[index] - 3}">${escapeHtml(truncateText(profile.nameZh || profile.name, 11))}</text><text class="network-node-sub" x="130" y="${personY[index] + 16}">${escapeHtml(academicProfileTypeLabel(profile.profileType))}</text></a>`).join("")}
        ${institutions.map((institution, index) => `<g class="network-institution-node"><rect x="395" y="${institutionY[index] - 28}" width="210" height="56" rx="5"></rect><text x="500" y="${institutionY[index] + 4}">${escapeHtml(truncateText(institution, 24))}</text></g>`).join("")}
        ${tags.map((tag, index) => `<g class="network-tag-node"><rect x="810" y="${tagY[index] - 24}" width="190" height="48" rx="24"></rect><text x="905" y="${tagY[index] + 4}">${escapeHtml(truncateText(tag, 24))}</text></g>`).join("")}
      </svg>
    </div>
    <div class="network-legend"><span><i class="legend-institution"></i>任职关系</span><span><i class="legend-research"></i>研究方向关联</span></div>
  </section>`;
}

function distributeNetworkNodes(count) {
  if (count <= 1) return [300];
  const start = 80;
  const end = 540;
  return Array.from({ length: count }, (_, index) => Math.round(start + index * (end - start) / (count - 1)));
}

function renderCases() {
  const labs = filteredLabs();
  const people = filteredPeople();
  els.pages.cases.innerHTML = `
    <section class="page-heading">
      <p class="eyebrow">Success Cases</p>
      <h1>成功案例</h1>
      <p>保留原有目标课题组与青年学者路径样本。所有条目只使用公开可验证来源，申请前必须回到原始链接核验。</p>
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
      ${methodCard("产业情报", state.data.industry?.sourcePolicyZh ?? "官方招聘与公司/团队主页优先，社区信息只作低权重参考。")}
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

function renderAcademicProfile() {
  const profile = academicProfiles().find((item) => item.id === state.selectedAcademicProfileId);
  if (!profile) {
    els.pages.profile.innerHTML = `<section class="profile-not-found"><p class="eyebrow">Academic Profile</p><h1>未找到这份人物档案</h1><p>该档案可能尚未进入公开数据，或链接中的人物 ID 已变更。</p><a class="primary-link-button" href="#people">返回学术人物</a></section>`;
    return;
  }
  const metrics = profile.publicationMetrics;
  const workLimit = profile.profileType === "mentor_group" ? 8 : 5;
  const works = (profile.representativeWorks ?? []).slice(0, workLimit);
  const links = Object.entries(profile.links ?? {}).filter(([, url]) => isExternalUrl(url));
  const evidence = (profile.evidence ?? []).filter((item) => isExternalUrl(item?.url));
  const updatedAt = profileUpdatedAt(profile);

  els.pages.profile.innerHTML = `
    <article class="profile-document">
      <header class="profile-masthead">
        <div class="profile-breadcrumb"><a href="#people">学术人物</a><span>/</span><span>${escapeHtml(profileDisplayName(profile))}</span></div>
        <div class="profile-title-row">
          <div>
            <p class="eyebrow">${escapeHtml(academicProfileTypeLabel(profile.profileType))}</p>
            <h1>${escapeHtml(profileDisplayName(profile))}</h1>
            <p class="profile-role">${escapeHtml(profile.currentPosition || "职务待补充")}</p>
            <p class="profile-affiliation">${escapeHtml([profile.institution, profile.department].filter(Boolean).join(" · ") || "机构信息待补充")}</p>
          </div>
          <div class="profile-actions" aria-label="档案操作">
            <button class="tiny-button" data-print-profile>打印</button>
            <button class="tiny-button primary" data-export-profile>导出 JSON</button>
          </div>
        </div>
        <div class="profile-status-row">
          ${qualityBadge(profile.quality)}
          ${profile.region || profile.country ? `<span class="profile-fact-chip">${escapeHtml([profile.region, profile.country].filter(Boolean).join(" / "))}</span>` : ""}
          ${profile.qsRankDisplay || profile.schoolScope ? `<span class="profile-fact-chip">${escapeHtml([profile.schoolScope, profile.qsRankDisplay].filter(Boolean).join(" · "))}</span>` : ""}
          <span class="profile-fact-chip">核验 ${escapeHtml(updatedAt || "待补充")}</span>
        </div>
        <div class="profile-research-summary">
          <div><h2>研究概况</h2><p>${escapeHtml(profile.research?.summaryZh || "公开研究概况待补充。")}</p></div>
          <div class="profile-research-tags">${academicTags(profile.research?.tags, 12)}</div>
        </div>
        ${links.length ? `<nav class="profile-source-nav" aria-label="人物主页与书目入口">${links.map(([key, url]) => `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeHtml(profileLinkLabel(key))}</a>`).join("")}</nav>` : ""}
      </header>

      <section class="profile-section profile-publications">
        <div class="profile-section-heading"><div><p class="eyebrow">Publication Record</p><h2>论文指标</h2></div><span>${escapeHtml(formatShortDate(metrics?.updatedAt) || "指标更新时间待补充")}</span></div>
        ${metrics ? renderPublicationMetrics(metrics) : professionalEmpty("论文指标尚待补充", "书目身份完成核验后，将展示总论文、近 5 年论文、引用与 h-index。", "书目数据")}
      </section>

      <section class="profile-section">
        <div class="profile-section-heading"><div><p class="eyebrow">Five-year Shift</p><h2>近 5 年研究变化</h2></div><span>${profile.research?.recentEvolution?.length ?? 0} 条公开记录</span></div>
        ${renderResearchEvolution(profile.research?.recentEvolution)}
      </section>

      <section class="profile-section">
        <div class="profile-section-heading"><div><p class="eyebrow">Venue Breakdown</p><h2>分赛道 Venue 分布</h2></div><span>预印本不计入 venue 总量</span></div>
        ${renderVenueBreakdown(profile.venueBreakdown)}
      </section>

      <section class="profile-section">
        <div class="profile-section-heading"><div><p class="eyebrow">Selected Works</p><h2>代表作</h2></div><span>${works.length} / ${workLimit} 篇</span></div>
        ${renderAcademicWorks(works, workLimit)}
      </section>

      <section class="profile-section profile-two-column">
        <div class="profile-column-section"><div class="profile-section-heading"><div><p class="eyebrow">Career</p><h2>学术时间线</h2></div></div>${renderAcademicTimeline(profile.timeline)}</div>
        <div class="profile-column-section"><div class="profile-section-heading"><div><p class="eyebrow">Recognition</p><h2>基金与奖项</h2></div></div>${renderGrantsAwards(profile.grantsAwards)}</div>
      </section>

      <section class="profile-section">
        <div class="profile-section-heading"><div><p class="eyebrow">Research Group</p><h2>课题组</h2></div><span>${profile.group?.name ? "公开课题组资料" : "暂无独立课题组记录"}</span></div>
        ${renderAcademicGroup(profile.group)}
      </section>

      <section class="profile-section profile-recruitment-section">
        <div class="profile-section-heading"><div><p class="eyebrow">Recruitment Evidence</p><h2>招聘与扩组信号</h2></div><span>七类信号不合并推断</span></div>
        <div class="profile-signal-list">${(profile.recruitmentSignals ?? []).map((signal) => renderRecruitmentSignal(signal)).join("") || professionalEmpty("招聘信号尚待补充", "未发现公开信号时，不据此推断是否接受申请。", "招聘证据")}</div>
      </section>

      <section class="profile-section">
        <div class="profile-section-heading"><div><p class="eyebrow">Evidence Ledger</p><h2>证据与更新时间</h2></div><span>${evidence.length} 条可回溯来源</span></div>
        ${renderAcademicEvidence(evidence)}
        <dl class="profile-update-ledger"><div><dt>档案核验</dt><dd>${escapeHtml(updatedAt || "待补充")}</dd></div><div><dt>指标更新</dt><dd>${escapeHtml(formatShortDate(metrics?.updatedAt) || "待补充")}</dd></div><div><dt>质量状态</dt><dd>${escapeHtml(profile.quality?.status === "ready" ? "资料完整" : "资料待完善")}</dd></div><div><dt>数据来源</dt><dd>${escapeHtml(profile.sourceKind || "公开资料")}</dd></div></dl>
      </section>

      <footer class="profile-footer"><p>档案仅陈列公开可验证事实；招聘状态与论文数据请以原始来源为准。</p><a href="#people">返回学术人物总览</a></footer>
    </article>
  `;
}

function renderPublicationMetrics(metrics) {
  const rows = [
    [metrics.countLabelZh || "数据库收录成果", metrics.worksCount],
    ["近 5 年论文", metrics.recentWorksCount],
    ["总引用", metrics.citedByCount ?? metrics.citationCount],
    ["近 5 年引用", metrics.recentCitedByCount ?? metrics.recentCitationCount],
    ["h-index", metrics.hIndex],
    ["i10-index", metrics.i10Index]
  ];
  const crossSource = metrics.crossSourceCounts;
  const crossSourceRows = crossSource ? `
    <div class="publication-cross-checks">
      <span><b>${formatMetric(crossSource.orcidRecordCount)}</b> ORCID 自关联记录</span>
      <span><b>${formatMetric(crossSource.crossrefOrcidWorksCount)}</b> Crossref ORCID 记录</span>
    </div>` : "";
  return `<dl class="publication-metric-grid">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${formatMetric(value)}</dd></div>`).join("")}</dl>${crossSourceRows}<p class="metric-caveat">${escapeHtml(metrics.countCaveatZh || "不同书目数据库口径不同，数量仅作公开数据参考。")}</p>`;
}

function renderResearchEvolution(items = []) {
  if (!items.length) return professionalEmpty("近 5 年研究变化尚待整理", "需基于论文主题、项目与公开研究陈述形成可回溯记录。", "研究变化");
  return `<ol class="research-evolution-list">${items.slice(0, 12).map((item, index) => {
    const value = typeof item === "string" ? { summaryZh: item } : item;
    const period = value.period || value.years || value.year || value.fromYear && value.toYear && `${value.fromYear}-${value.toYear}` || `阶段 ${index + 1}`;
    const title = value.titleZh || value.title || value.topic || value.summaryZh || value.summary || "研究方向变化";
    const detail = value.summaryZh && value.summaryZh !== title ? value.summaryZh : value.summary && value.summary !== title ? value.summary : [value.from, value.to].filter(Boolean).join(" → ");
    return `<li><span>${escapeHtml(period)}</span><div><h3>${escapeHtml(title)}</h3>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div></li>`;
  }).join("")}</ol>`;
}

function renderVenueBreakdown(items = []) {
  const rows = items.filter((item) => Number(item?.count ?? 0) > 0);
  if (!rows.length) return professionalEmpty("Venue 分赛道数据尚待补充", "完成论文去重与 venue 分类后，将按赛道和层级展示。", "Venue 数据");
  const max = Math.max(...rows.map((item) => Number(item.count ?? 0)), 1);
  return `<div class="venue-breakdown-list">${rows.map((item) => `<div class="venue-breakdown-row"><div><strong>${escapeHtml(venueLabel(item))}</strong><span>${escapeHtml(item.tierLabelZh || venueTierLabel(item.tier))}</span></div><i><b style="width:${Math.max(5, Number(item.count ?? 0) / max * 100)}%"></b></i><span>${Number(item.count ?? 0)}</span></div>`).join("")}</div>`;
}

function renderAcademicWorks(works, targetCount) {
  if (!works.length) return professionalEmpty("代表作尚待补充", `该类型档案计划收录 ${targetCount} 篇可回溯代表作。`, "代表作");
  return `<ol class="academic-work-list">${works.map((work, index) => `<li><span class="work-index">${String(index + 1).padStart(2, "0")}</span><div><h3>${isExternalUrl(work.url) ? `<a href="${escapeAttr(work.url)}" target="_blank" rel="noreferrer">${escapeHtml(work.title)}</a>` : escapeHtml(work.title)}</h3><p>${escapeHtml([work.authors, work.venue, work.note].flat().filter(Boolean).join(" · ") || "出版信息待补充")}</p></div><span class="work-year">${escapeHtml(work.year || "待补")}</span></li>`).join("")}</ol>`;
}

function renderAcademicTimeline(items = []) {
  if (!items.length) return professionalEmpty("学术时间线尚待补充", "教育、博后与任职经历需由公开主页或机构资料核验。", "时间线");
  return `<ol class="academic-timeline">${items.map((item, index) => {
    const value = typeof item === "string" ? { summary: item } : item;
    const type = timelineTypeLabel(value.type);
    const title = value.role || value.title || value.degree || value.position || type;
    const detail = [value.institution, value.department, value.advisor && `导师 ${value.advisor}`, value.summaryZh || value.summary].filter(Boolean).join(" · ");
    const period = value.years || value.period || value.year || [value.startYear, value.endYear].filter(Boolean).join("-") || String(index + 1).padStart(2, "0");
    return `<li><span>${escapeHtml(period)}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail || "公开经历细节待补充")}</p></div></li>`;
  }).join("")}</ol>`;
}

function renderGrantsAwards(items = []) {
  if (!items.length) return professionalEmpty("基金与奖项尚待补充", "仅收录可由基金机构、学校或项目主页核验的记录。", "基金奖项");
  return `<div class="grant-award-list">${items.map((item) => {
    const value = typeof item === "string" ? { title: item } : item;
    const title = value.titleZh || value.title || value.name || value.award || value.grant || "基金或奖项";
    const detail = [value.funder || value.organization, value.role, value.amount, value.summaryZh || value.summary].filter(Boolean).join(" · ");
    return `<div><span>${escapeHtml(value.year || value.period || "")}</span><strong>${isExternalUrl(value.url) ? `<a href="${escapeAttr(value.url)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>` : escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
  }).join("")}</div>`;
}

function renderAcademicGroup(group) {
  if (!group || !group.name) return professionalEmpty("课题组资料尚待补充", "人物主页未提供可核验的独立课题组名称与成员信息。", "课题组");
  const members = (group.members ?? []).slice(0, 20);
  const alumni = (group.alumni ?? []).slice(0, 12);
  return `<div class="academic-group-layout"><div class="group-identity"><h3>${isExternalUrl(group.homepage) ? `<a href="${escapeAttr(group.homepage)}" target="_blank" rel="noreferrer">${escapeHtml(group.name)}</a>` : escapeHtml(group.name)}</h3><p>${escapeHtml(group.collaborationStyleZh || "公开合作方式待补充。")}</p></div><div class="group-roster"><div><strong>当前成员</strong>${members.length ? `<ul>${members.map((item) => `<li>${escapeHtml(personLikeLabel(item))}</li>`).join("")}</ul>` : `<p>待补充</p>`}</div><div><strong>校友</strong>${alumni.length ? `<ul>${alumni.map((item) => `<li>${escapeHtml(personLikeLabel(item))}</li>`).join("")}</ul>` : `<p>待补充</p>`}</div></div></div>`;
}

function renderAcademicEvidence(evidence) {
  if (!evidence.length) return professionalEmpty("公开证据尚待补充", "身份、论文、招聘和项目记录需要保留可访问的原始链接。", "证据台账");
  return `<div class="academic-evidence-list">${evidence.map((item, index) => `<a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer"><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(evidenceTypeLabel(item.type))}</strong><small>${escapeHtml(item.url)}</small></div><b>${escapeHtml(item.confidence || "待核验")}</b></a>`).join("")}</div>`;
}

function renderRecruitmentSignal(signal = {}, compact = false) {
  const presentation = RECRUITMENT_SIGNAL_PRESENTATION[signal.type] ?? { label: signal.labelZh || signal.type || "未分类信号", note: "证据类型待核对", mark: "?", className: "signal-unknown" };
  const label = signal.labelZh || presentation.label;
  const summary = signal.summaryZh || presentation.note;
  const source = isExternalUrl(signal.sourceUrl) ? `<a href="${escapeAttr(signal.sourceUrl)}" target="_blank" rel="noreferrer">查看证据</a>` : `<span>来源待补充</span>`;
  return `<div class="recruitment-signal ${escapeAttr(presentation.className)} ${compact ? "is-compact" : ""}"><span class="signal-mark" aria-hidden="true">${escapeHtml(presentation.mark)}</span><div><strong>${escapeHtml(label)}</strong>${compact ? "" : `<p>${escapeHtml(summary)}</p><small>${escapeHtml([signal.observedAt && `观察 ${formatShortDate(signal.observedAt)}`, signal.expiresAt && `截止 ${formatShortDate(signal.expiresAt)}`, signal.confidence && `可信度 ${signal.confidence}`].filter(Boolean).join(" · ") || presentation.note)}</small>`}</div>${compact ? "" : source}</div>`;
}

function exportAcademicProfile() {
  const profile = academicProfiles().find((item) => item.id === state.selectedAcademicProfileId);
  if (!profile) return;
  const payload = {
    schemaVersion: academicData().schemaVersion,
    exportedAt: new Date().toISOString(),
    profile
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `academic-profile-${safeFileName(profile.id)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function showIndustryOpportunityDetail(opportunityId) {
  const opportunity = (state.data.industry?.opportunities ?? []).find((item) => item.id === opportunityId);
  if (!opportunity) return;
  const company = (state.data.industry?.companies ?? []).find((item) => item.id === opportunity.companyId);
  els.drawer.classList.add("open");
  els.drawer.innerHTML = `
    <button class="drawer-close" data-close-drawer aria-label="关闭">×</button>
    <div class="drawer-body">
      <p class="eyebrow">产业岗位详情</p>
      <h2>${escapeHtml(opportunity.titleZh || opportunity.title)}</h2>
      <p class="muted">${escapeHtml([opportunity.title, opportunity.company, opportunity.team].filter(Boolean).join(" · "))}</p>
      <div class="score-line">${industryScoreBadge(opportunity)} <span>${escapeHtml(opportunity.availabilityZh || "")}</span></div>
      ${Number(opportunity.identityRisk ?? 0) >= 40 ? `<p class="risk-banner">当前可行性较低：身份、地区或岗位资历要求需要单独确认。</p>` : ""}
      ${detailSection("五维评分", renderIndustryScores(opportunity))}
      ${detailSection("岗位信息", infoList([
        ["公司/团队", [opportunity.company, opportunity.team].filter(Boolean).join(" / ")],
        ["中文/英文职位", [opportunity.titleZh, opportunity.title].filter(Boolean).join(" / ")],
        ["地区", [opportunity.city, opportunity.region].filter(Boolean).join(" / ")],
        ["岗位方向", opportunity.roleFamily],
        ["招聘状态", opportunity.availabilityZh],
        ["与你的时间线", opportunity.timingFit === "future_action" ? "未来可行动" : "目标岗位样本"],
        ["来源更新时间", opportunity.sourceUpdatedAt],
        ["来源等级", `${opportunity.confidence ?? "待核验"} · ${opportunity.sourceType ?? ""}`],
        ["原始链接", link(opportunity.sourceUrl, "打开官方来源")]
      ]))}
      ${detailSection("为什么关注", `<p>${escapeHtml(opportunity.summaryZh || "")}</p>`)}
      ${detailSection("反复出现的技能", tagList(opportunity.skills ?? []))}
      ${company ? detailSection("公司画像", `
        <p>${escapeHtml(company.whyTrackZh || "")}</p>
        <button class="inline-button" data-industry-company-id="${escapeAttr(company.id)}">查看公司与团队</button>
      `) : ""}
      ${state.data.mode === "private" ? detailSection("个人申请跟踪", renderIndustryLocalTracking("opportunity", opportunity.id)) : ""}
      ${detailSection("核验提醒", `<p class="ai-notice">岗位状态、薪资、毕业时间和身份要求均以原始招聘页面为准；历史样本不可直接投递。</p>`)}
    </div>
  `;
  bindLocalTrackingControls();
}

function showIndustryCompanyDetail(companyId) {
  const company = (state.data.industry?.companies ?? []).find((item) => item.id === companyId);
  if (!company) return;
  const opportunities = (state.data.industry?.opportunities ?? []).filter((item) => item.companyId === companyId);
  const people = (state.data.industry?.people ?? []).filter((item) => item.companyId === companyId).slice(0, 8);
  els.drawer.classList.add("open");
  els.drawer.innerHTML = `
    <button class="drawer-close" data-close-drawer aria-label="关闭">×</button>
    <div class="drawer-body">
      <p class="eyebrow">重点公司与团队</p>
      <h2>${escapeHtml(company.nameZh || company.name)}</h2>
      <p class="muted">${escapeHtml(company.name)} · ${escapeHtml(company.category || "")}</p>
      <div class="score-line">${industryScoreBadge(company)} <span>${escapeHtml(company.priority || "")}</span></div>
      ${Number(company.identityRisk ?? 0) >= 40 ? `<p class="risk-banner">当前可行性较低：保留作为长期目标，优先核验身份与地点限制。</p>` : ""}
      ${detailSection("五维评分", renderIndustryScores(company))}
      ${detailSection("公司画像", `<p>${escapeHtml(company.whyTrackZh || "")}</p>`)}
      ${detailSection("团队层级", reasonList("重点团队", company.teams ?? []))}
      ${detailSection("岗位方向", tagList(company.roleFamilies ?? []))}
      ${detailSection("工作地点", tagList([...(company.locations ?? []), ...(company.regions ?? [])]))}
      ${detailSection("薪资与证据", infoList([
        ["薪资参考", company.salaryBandZh],
        ["证据等级", company.sourceConfidence],
        ["官方招聘", link(company.careerUrl, "打开招聘页")],
        ["公司/团队主页", link(company.homepage, "打开主页")]
      ]))}
      ${detailSection("关联岗位", opportunities.length ? `<div class="linked-list">${opportunities.map((item) => `
        <button class="linked-row" data-industry-opportunity-id="${escapeAttr(item.id)}">
          ${industryScoreBadge(item)}
          <span><b>${escapeHtml(item.titleZh || item.title)}</b><small>${escapeHtml([item.city, item.availabilityZh].filter(Boolean).join(" · "))}</small></span>
        </button>
      `).join("")}</div>` : `<p class="muted">当前只有公司级监控入口。</p>`)}
      ${detailSection("关联人物", people.length ? `<div class="linked-list">${people.map((person) => `
        <button class="linked-row" data-industry-person-id="${escapeAttr(person.id)}">
          <span class="trust-label">${Number(person.replicabilityScore ?? 0)}</span>
          <span><b>${escapeHtml(person.name)}</b><small>${escapeHtml(person.currentPosition || "")}</small></span>
        </button>
      `).join("")}</div>` : `<p class="muted">人物档案待继续补充。</p>`)}
      ${state.data.mode === "private" ? detailSection("关注与联系", renderIndustryLocalTracking("company", company.id)) : ""}
    </div>
  `;
  bindLocalTrackingControls();
}

function showIndustryPersonDetail(personId) {
  const person = (state.data.industry?.people ?? []).find((item) => item.id === personId);
  if (!person) return;
  els.drawer.classList.add("open");
  els.drawer.innerHTML = `
    <button class="drawer-close" data-close-drawer aria-label="关闭">×</button>
    <div class="drawer-body">
      <p class="eyebrow">产业人物与成长路径</p>
      <h2>${escapeHtml(person.nameZh ? `${person.name} / ${person.nameZh}` : person.name)}</h2>
      <p class="muted">${escapeHtml([person.currentPosition, person.companyNameZh, person.team].filter(Boolean).join(" · "))}</p>
      <div class="score-line"><span class="replicability-badge">可复制性 ${Number(person.replicabilityScore ?? 0)}</span><span>${escapeHtml(person.confidence || "待核验")}</span></div>
      ${detailSection("成长路径", `<p>${escapeHtml(person.pathSummaryZh || "")}</p>`)}
      ${detailSection("教育与背景", `<p>${escapeHtml(person.educationSummaryZh || "公开信息待补充")}</p>`)}
      ${detailSection("研究与技能", tagList(person.fieldTags ?? []))}
      ${detailSection("代表作/项目", renderWorks(person.representativeWorks ?? []))}
      ${detailSection("路径可复制性", `<p>${escapeHtml(person.replicabilityZh || "")}</p><p class="ai-notice">可复制性是基于公开路径的规则判断，不是事实陈述或录用概率预测。</p>`)}
      ${detailSection("公开入口", infoList([
        ["个人/官方主页", link(person.homepage, "打开主页")],
        ["Google Scholar", link(person.googleScholar, "打开 Scholar")],
        ["LinkedIn", link(person.linkedin, "打开 LinkedIn")],
        ["公开邮箱", person.publicEmail],
        ["证据等级", person.confidence]
      ]))}
      ${detailSection("公开证据", renderEvidence(person.evidence ?? []))}
      ${state.data.mode === "private" ? detailSection("联系记录", renderIndustryLocalTracking("person", person.id)) : ""}
    </div>
  `;
  bindLocalTrackingControls();
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
        ["当前状态", job.lifecycleLabelZh || job.freshness?.labelZh || "待核验"],
        ["首次发现", formatDateTime(job.firstSeenAt)],
        ["最近变化", formatDateTime(job.lastChangedAt)],
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

function academicData() {
  if (!state.data) return fallbackAcademic();
  const academic = state.data.academic;
  if (!academic || typeof academic !== "object") return fallbackAcademic();
  return {
    ...fallbackAcademic(),
    ...academic,
    profiles: Array.isArray(academic.profiles) ? academic.profiles : [],
    recruitmentSignalTypes: Array.isArray(academic.recruitmentSignalTypes) ? academic.recruitmentSignalTypes : []
  };
}

function academicProfiles() {
  return academicData().profiles;
}

function filteredAcademicProfiles() {
  const filters = state.peopleFilters;
  return academicProfiles()
    .filter((profile) => {
      const searchText = academicSearchText(profile);
      const signals = profile.recruitmentSignals ?? [];
      const qualityStatus = profile.quality?.status || "incomplete";
      return (!filters.search || searchText.includes(filters.search.toLowerCase()))
        && (!filters.type || profile.profileType === filters.type)
        && (!filters.region || profile.region === filters.region || profile.country === filters.region)
        && (!filters.research || (profile.research?.tags ?? []).includes(filters.research))
        && (!filters.recruitment || signals.some((signal) => signal.type === filters.recruitment))
        && (!filters.quality || qualityStatus === filters.quality);
    })
    .sort((a, b) => {
      const typeOrder = { mentor_group: 0, young_scholar: 1, academic_reference: 2 };
      return (typeOrder[a.profileType] ?? 9) - (typeOrder[b.profileType] ?? 9)
        || Number(b.quality?.score ?? 0) - Number(a.quality?.score ?? 0)
        || profileDisplayName(a).localeCompare(profileDisplayName(b), "zh-CN");
    });
}

function academicSearchText(profile) {
  return [
    profile.name,
    profile.nameZh,
    profile.currentPosition,
    profile.institution,
    profile.department,
    profile.country,
    profile.region,
    profile.group?.name,
    profile.research?.summaryZh,
    ...(profile.research?.tags ?? []),
    ...(profile.research?.methods ?? []),
    ...(profile.research?.applications ?? [])
  ].filter(Boolean).join(" ").toLowerCase();
}

function toggleAcademicComparison(id) {
  if (state.peopleCompare.has(id)) {
    state.peopleCompare.delete(id);
    state.peopleMessage = "";
    return;
  }
  if (state.peopleCompare.size >= 5) {
    state.peopleMessage = "横向对比最多选择 5 人。";
    return;
  }
  state.peopleCompare.add(id);
  state.peopleMessage = `已加入对比：${state.peopleCompare.size}/5。`;
}

function academicTypeOptions() {
  return Object.entries(ACADEMIC_PROFILE_TYPES).map(([value, label]) => [value, label]);
}

function academicRegionOptions() {
  return [...new Set(academicProfiles().flatMap((profile) => [profile.region, profile.country]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
    .map((value) => [value, value]);
}

function academicResearchOptions() {
  return [...new Set(academicProfiles().flatMap((profile) => profile.research?.tags ?? []).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((value) => [value, value]);
}

function academicRecruitmentTypes() {
  const configured = new Map(academicData().recruitmentSignalTypes.map((item) => [item.id, item]));
  return Object.keys(RECRUITMENT_SIGNAL_PRESENTATION).map((id) => ({ id, ...(configured.get(id) ?? {}) }));
}

function academicRecruitmentOptions() {
  return academicRecruitmentTypes().map((item) => [item.id, item.labelZh || RECRUITMENT_SIGNAL_PRESENTATION[item.id]?.label || item.id]);
}

function peopleFilterInput(name, label, placeholder) {
  return `<label class="filter-control people-search-control"><span>${escapeHtml(label)}</span><input data-people-filter="${escapeAttr(name)}" value="${escapeAttr(state.peopleFilters[name])}" placeholder="${escapeAttr(placeholder)}"></label>`;
}

function peopleFilterSelect(name, label, options) {
  return `<label class="filter-control"><span>${escapeHtml(label)}</span><select data-people-filter="${escapeAttr(name)}"><option value="">全部</option>${options.map(([value, text]) => `<option value="${escapeAttr(value)}" ${state.peopleFilters[name] === value ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>`;
}

function peopleMetric(label, value, caption) {
  return `<div class="people-metric"><span>${escapeHtml(label)}</span><strong>${formatMetric(value)}</strong><small>${escapeHtml(caption)}</small></div>`;
}

function academicProfileTypeLabel(type) {
  return ACADEMIC_PROFILE_TYPES[type] || type || "未分类";
}

function profileTypeBadge(type) {
  return `<span class="profile-type-badge type-${escapeAttr(type || "unknown")}">${escapeHtml(academicProfileTypeLabel(type))}</span>`;
}

function qualityBadge(quality = {}) {
  const ready = quality.status === "ready" || quality.isPublicReady === true;
  const missing = (quality.missing ?? []).map(qualityFieldLabel).join("、");
  const title = ready ? "资料字段达到当前质量门槛" : `待补：${missing || "公开字段"}`;
  return `<span class="quality-badge ${ready ? "quality-ready" : "quality-incomplete"}" title="${escapeAttr(title)}">${ready ? "资料完整" : `待完善 ${Number(quality.score ?? 0)}%`}</span>`;
}

function qualityFieldLabel(value) {
  return ({
    officialIdentity: "官方身份",
    bibliographicIdentity: "书目身份",
    researchEvolution: "研究变化",
    publicationMetrics: "论文指标",
    venueBreakdown: "Venue 分布",
    representativeWorks: "代表作",
    careerOrGroup: "经历或课题组",
    evidenceCoverage: "证据覆盖",
    freshness: "更新时间"
  })[value] || value;
}

function profileDisplayName(profile) {
  if (profile.nameZh && profile.name && profile.nameZh !== profile.name) return `${profile.nameZh} / ${profile.name}`;
  return profile.nameZh || profile.name || "姓名待补充";
}

function academicTags(values = [], limit = 5) {
  const tags = [...new Set(values.filter(Boolean))].slice(0, limit);
  return tags.length ? tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") : `<span class="is-empty">研究方向待补充</span>`;
}

function formatMetric(value) {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(Number(value));
}

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function profileUpdatedAt(profile) {
  return formatShortDate(profile.lastVerifiedAt || profile.publicationMetrics?.updatedAt);
}

function venueLabel(item = {}) {
  return item.trackLabelZh || item.trackLabel || item.track || item.venue || "未分类赛道";
}

function venueTierLabel(tier) {
  return ({
    top_core: "核心顶级",
    important_mainstream: "重要主流",
    related_reference: "相关参考",
    core: "核心",
    selective: "精选",
    supporting: "补充"
  })[tier] || tier || "层级待补充";
}

function profileLinkLabel(key) {
  return ({ homepage: "个人主页", groupHomepage: "课题组主页", openings: "招聘页面", googleScholar: "Google Scholar", openalex: "OpenAlex", orcid: "ORCID", semanticScholar: "Semantic Scholar", dblp: "DBLP" })[key] || key;
}

function timelineTypeLabel(type) {
  return ({ phd: "博士", postdoc: "博士后", current_position: "当前任职", education: "教育经历", position: "任职经历" })[type] || "学术经历";
}

function personLikeLabel(item) {
  if (typeof item === "string") return item;
  return [item.nameZh || item.name, item.role || item.position, item.institution].filter(Boolean).join(" · ") || "成员信息待补充";
}

function evidenceTypeLabel(type) {
  return ({ official_profile: "官方人物主页", official_homepage: "官方主页", official_openings: "官方招聘页面", openalex_author: "OpenAlex 作者记录", google_scholar: "Google Scholar", qs_ranking: "QS 排名来源", institution_profile: "机构人物主页", publication: "出版记录", grant: "基金项目来源" })[type] || String(type || "公开来源").replaceAll("_", " ");
}

function professionalEmpty(title, body, label = "数据状态") {
  return `<div class="professional-empty"><span>${escapeHtml(label)}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></div>`;
}

function truncateText(value, limit) {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1))}…` : text;
}

function isExternalUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function safeFileName(value) {
  return String(value || "profile").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "profile";
}

function highMatchJobs() {
  return [...(state.data.jobs ?? [])]
    .filter((job) => ["A", "B"].includes(job.priority)
      && job.recordType !== "watch_seed"
      && job.lifecycleStatus !== "expired")
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
      && (!filters.freshness || freshnessMatches(job, filters.freshness))
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
  const lifecycleDelta = (a.lifecycleStatus === "expired" ? 1 : 0) - (b.lifecycleStatus === "expired" ? 1 : 0);
  if (lifecycleDelta) return lifecycleDelta;
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

function sortedIndustryCompanies() {
  return [...(state.data.industry?.companies ?? [])].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));
}

function sortedIndustryOpportunities() {
  return [...(state.data.industry?.opportunities ?? [])].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));
}

function filteredIndustryCompanies() {
  const filters = state.industryFilters;
  return sortedIndustryCompanies().filter((company) => {
    const searchText = industrySearchText(company);
    return (!filters.search || searchText.includes(filters.search.toLowerCase()))
      && (!filters.region || (company.regions ?? []).includes(filters.region) || searchText.includes(filters.region.toLowerCase()))
      && (!filters.category || company.category === filters.category)
      && (!filters.roleFamily || searchText.includes(filters.roleFamily.toLowerCase()));
  });
}

function filteredIndustryOpportunities() {
  const filters = state.industryFilters;
  return sortedIndustryOpportunities().filter((opportunity) => {
    const company = (state.data.industry?.companies ?? []).find((item) => item.id === opportunity.companyId);
    const searchText = industrySearchText({ ...opportunity, companyCategory: company?.category });
    return (!filters.search || searchText.includes(filters.search.toLowerCase()))
      && (!filters.region || opportunity.region === filters.region || searchText.includes(filters.region.toLowerCase()))
      && (!filters.category || company?.category === filters.category)
      && (!filters.roleFamily || opportunity.roleFamily === filters.roleFamily)
      && (!filters.timing || opportunity.timingFit === filters.timing)
      && (!filters.status || opportunity.status === filters.status);
  });
}

function filteredIndustryPeople() {
  const filters = state.industryFilters;
  return [...(state.data.industry?.people ?? [])]
    .filter((person) => {
      const company = (state.data.industry?.companies ?? []).find((item) => item.id === person.companyId);
      const searchText = industrySearchText({ ...person, companyCategory: company?.category });
      return (!filters.search || searchText.includes(filters.search.toLowerCase()))
        && (!filters.region || person.region === filters.region || searchText.includes(filters.region.toLowerCase()))
        && (!filters.category || company?.category === filters.category)
        && (!filters.roleFamily || searchText.includes(filters.roleFamily.toLowerCase()));
    })
    .sort((a, b) => (b.replicabilityScore ?? 0) - (a.replicabilityScore ?? 0));
}

function industrySearchText(item) {
  return [
    item.name,
    item.nameZh,
    item.title,
    item.titleZh,
    item.company,
    item.companyNameZh,
    item.companyCategory,
    item.team,
    item.category,
    item.region,
    item.city,
    item.roleFamily,
    item.currentPosition,
    item.pathSummaryZh,
    item.educationSummaryZh,
    ...(item.teams ?? []),
    ...(item.roleFamilies ?? []),
    ...(item.fieldTags ?? []),
    ...(item.skills ?? [])
  ].filter(Boolean).join(" ").toLowerCase();
}

function industryRegionOptions() {
  const values = new Set();
  for (const company of state.data.industry?.companies ?? []) {
    for (const region of company.regions ?? []) values.add(region);
  }
  for (const opportunity of state.data.industry?.opportunities ?? []) values.add(opportunity.region);
  return [...values].filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-CN")).map((value) => [value, value]);
}

function industryCategoryOptions() {
  return [...new Set((state.data.industry?.companies ?? []).map((item) => item.category).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
    .map((value) => [value, value]);
}

function industryRoleOptions() {
  return [...new Set((state.data.industry?.opportunities ?? []).map((item) => item.roleFamily).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
    .map((value) => [value, value]);
}

function toggleComparison(collection, id) {
  if (collection.has(id)) {
    collection.delete(id);
    return;
  }
  if (collection.size >= 4) return;
  collection.add(id);
}

function renderIndustryComparePanel() {
  const companies = [...state.companyCompare]
    .map((id) => (state.data.industry?.companies ?? []).find((item) => item.id === id))
    .filter(Boolean);
  const opportunities = [...state.opportunityCompare]
    .map((id) => (state.data.industry?.opportunities ?? []).find((item) => item.id === id))
    .filter(Boolean);
  if (!companies.length && !opportunities.length) return "";
  return `
    <section class="industry-compare-band">
      <div class="section-head">
        <div><p class="eyebrow">Compare</p><h2>并排比较</h2></div>
        <button class="tiny-button" data-clear-industry-compare>清空</button>
      </div>
      ${companies.length ? `<div class="compare-grid">${companies.map(compareCompanyColumn).join("")}</div>` : ""}
      ${opportunities.length ? `<div class="compare-grid">${opportunities.map(compareOpportunityColumn).join("")}</div>` : ""}
    </section>
  `;
}

function industryExpandButton(key, visibleCount, totalCount) {
  if (totalCount <= visibleCount && !state.industryExpanded[key]) return "";
  const expanded = state.industryExpanded[key];
  return `<div class="expand-row"><button class="tiny-button" data-expand-industry="${escapeAttr(key)}">${expanded ? "收起" : `显示全部 ${totalCount} 条`}</button></div>`;
}

function compareCompanyColumn(company) {
  return `<div class="compare-column">
    <strong>${escapeHtml(company.nameZh || company.name)}</strong>
    <span>综合 ${Number(company.overallScore ?? 0)}</span>
    <span>薪资 ${Number(company.salaryScore ?? 0)}</span>
    <span>供给 ${Number(company.supplyScore ?? 0)}</span>
    <span>可行 ${Number(company.feasibilityScore ?? 0)}</span>
    <span>匹配 ${Number(company.fitScore ?? 0)}</span>
    <span>风险 ${Number(company.identityRisk ?? 0)}</span>
  </div>`;
}

function compareOpportunityColumn(opportunity) {
  return `<div class="compare-column">
    <strong>${escapeHtml(opportunity.titleZh || opportunity.title)}</strong>
    <span>${escapeHtml(opportunity.company || "")}</span>
    <span>综合 ${Number(opportunity.overallScore ?? 0)}</span>
    <span>薪资 ${Number(opportunity.salaryScore ?? 0)}</span>
    <span>可行 ${Number(opportunity.feasibilityScore ?? 0)}</span>
    <span>匹配 ${Number(opportunity.fitScore ?? 0)}</span>
    <span>风险 ${Number(opportunity.identityRisk ?? 0)}</span>
  </div>`;
}

function metricCard(label, value, caption) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(caption)}</small></div>`;
}

function renderWeeklyUpdates(updates = {}) {
  const allItems = updates.items ?? [];
  const items = [
    ...allItems.filter((item) => item.type === "new"),
    ...allItems.filter((item) => item.type === "expired"),
    ...allItems.filter((item) => item.type === "updated")
  ].slice(0, 8);
  if (!items.length) return "";
  return `
    <section class="weekly-update-band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Weekly Changes</p>
          <h2>本周新增与变化</h2>
        </div>
        <div class="weekly-update-counts">
          <span class="freshness-badge freshness-new">新增 ${Number(updates.newCount ?? 0)}</span>
          <span class="freshness-badge freshness-updated">更新 ${Number(updates.updatedCount ?? 0)}</span>
          <span class="freshness-badge freshness-expired">失效 ${Number(updates.expiredCount ?? 0)}</span>
        </div>
      </div>
      <div class="weekly-update-list">${items.map(weeklyUpdateRow).join("")}</div>
    </section>
  `;
}

function weeklyUpdateRow(item) {
  const detailAttr = item.kind === "industry"
    ? `data-industry-opportunity-id="${escapeAttr(item.id)}"`
    : `data-job-id="${escapeAttr(item.id)}"`;
  return `<article class="weekly-update-row">
    ${freshnessBadge({ freshness: { type: item.type, labelZh: item.labelZh, highlighted: true } })}
    <button class="row-title" ${detailAttr}>${escapeHtml(item.title || "")}</button>
    <span>${escapeHtml(item.organization || "")}</span>
    <span>${escapeHtml(item.region || "")}</span>
    <strong>${item.priority ? `${escapeHtml(item.priority)} ${Number(item.score ?? 0)}` : Number(item.score ?? 0)}</strong>
  </article>`;
}

function industryOpportunityRow(opportunity) {
  const selected = state.opportunityCompare.has(opportunity.id);
  return `
    <article class="industry-opportunity-row">
      <div class="industry-score-cell">${industryScoreBadge(opportunity)}</div>
      <div class="industry-opportunity-main">
        <div class="title-with-status">${freshnessBadge(opportunity)}<button class="row-title" data-industry-opportunity-id="${escapeAttr(opportunity.id)}">${escapeHtml(opportunity.titleZh || opportunity.title)}</button></div>
        <small>${escapeHtml([opportunity.title, opportunity.company, opportunity.team].filter(Boolean).join(" · "))}</small>
        <p>${escapeHtml(opportunity.summaryZh || "")}</p>
      </div>
      <div class="industry-row-meta">
        <span>${escapeHtml([opportunity.city, opportunity.region].filter(Boolean).join(" / "))}</span>
        <span>${escapeHtml(opportunity.roleFamily || "")}</span>
      </div>
      <div class="industry-row-status">
        <span class="status-chip status-${escapeAttr(opportunity.status || "watch")}">${escapeHtml(opportunity.availabilityZh || opportunity.status || "")}</span>
        ${Number(opportunity.identityRisk ?? 0) >= 40 ? `<span class="risk-chip">当前可行性较低</span>` : ""}
      </div>
      <div class="industry-row-actions">
        <button class="tiny-button" data-compare-opportunity-id="${escapeAttr(opportunity.id)}">${selected ? "移出对比" : "对比"}</button>
        <button class="tiny-button primary" data-industry-opportunity-id="${escapeAttr(opportunity.id)}">详情</button>
      </div>
    </article>
  `;
}

function industryCompanyRankRow(company) {
  return `
    <button class="company-rank-row" data-industry-company-id="${escapeAttr(company.id)}">
      ${industryScoreBadge(company)}
      <span><strong>${escapeHtml(company.nameZh || company.name)}</strong><small>${escapeHtml(company.category || "")}</small></span>
      <b>${Number(company.overallScore ?? 0)}</b>
    </button>
  `;
}

function industryCompanyCard(company) {
  const selected = state.companyCompare.has(company.id);
  return `
    <article class="industry-company-card">
      <div class="company-card-heading">
        <div>${industryScoreBadge(company)} <span class="trust-label">${escapeHtml(company.priority || "")}</span></div>
        <span class="company-category">${escapeHtml(company.category || "")}</span>
      </div>
      <h3>${escapeHtml(company.nameZh || company.name)}</h3>
      <p class="company-name-en">${escapeHtml(company.name || "")}</p>
      <div class="company-score-grid">
        ${compactIndustryScore("薪资", company.salaryScore)}
        ${compactIndustryScore("供给", company.supplyScore)}
        ${compactIndustryScore("可行", company.feasibilityScore)}
        ${compactIndustryScore("匹配", company.fitScore)}
      </div>
      <p>${escapeHtml(company.whyTrackZh || "")}</p>
      <div class="tag-list">${tagList(company.teams ?? [])}</div>
      ${Number(company.identityRisk ?? 0) >= 40 ? `<span class="risk-chip block">当前可行性较低 · 风险 ${Number(company.identityRisk)}</span>` : ""}
      <div class="card-actions">
        <button class="tiny-button" data-compare-company-id="${escapeAttr(company.id)}">${selected ? "移出对比" : "加入对比"}</button>
        <button class="inline-button" data-industry-company-id="${escapeAttr(company.id)}">公司与团队详情</button>
      </div>
    </article>
  `;
}

function industryPersonCard(person) {
  return `
    <article class="industry-person-card">
      <div class="person-top">
        <span class="replicability-badge">可复制性 ${Number(person.replicabilityScore ?? 0)}</span>
        <span>${escapeHtml(person.confidence || "待核验")}</span>
      </div>
      <h3>${escapeHtml(person.nameZh ? `${person.name} / ${person.nameZh}` : person.name)}</h3>
      <p>${escapeHtml(person.currentPosition || "")}</p>
      <p class="muted">${escapeHtml([person.companyNameZh, person.team].filter(Boolean).join(" · "))}</p>
      <div class="tag-list">${tagList(person.fieldTags ?? [])}</div>
      <p class="reason">${escapeHtml(person.pathSummaryZh || "")}</p>
      <button class="inline-button" data-industry-person-id="${escapeAttr(person.id)}">查看背景、代表作与路径</button>
    </article>
  `;
}

function salaryBenchmarkRow(item) {
  return `<tr>
    <td><strong>${escapeHtml(item.labelZh || "")}</strong><div class="table-note">评分 ${Number(item.score ?? 0)}</div></td>
    <td>${escapeHtml(item.originalRange || "")}</td>
    <td>${escapeHtml(item.cnyRange || "")}</td>
    <td>${escapeHtml(item.purchasingPowerZh || "")}</td>
    <td><span class="trust-label">${escapeHtml(item.confidence || "待核验")}</span><div class="table-note">${escapeHtml(item.noteZh || "")}</div></td>
  </tr>`;
}

function industrySkillRow(skill) {
  const max = Math.max(...(state.data.industry?.skillDemand ?? []).map((item) => Number(item.count ?? 0)), 1);
  const width = Math.round(Number(skill.count ?? 0) / max * 100);
  return `<div class="skill-demand-row">
    <div><strong>${escapeHtml(skill.name || "")}</strong><small>${escapeHtml(skill.category || "")}</small></div>
    <div class="skill-bar" aria-label="${escapeAttr(skill.name)} ${Number(skill.count ?? 0)} 个样本"><span style="width:${width}%"></span></div>
    <b>${Number(skill.count ?? 0)}</b>
    <p>${escapeHtml(skill.whyZh || "")}</p>
  </div>`;
}

function anonymousPathCard(path) {
  return `<article class="anonymous-path-card">
    <div class="person-top"><span>${escapeHtml(path.region || "")}</span><span>${escapeHtml(path.evidenceLevel || "")}</span></div>
    <h3>${escapeHtml(path.titleZh || "")}</h3>
    <ol>${(path.steps ?? []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
    <p>${escapeHtml(path.lessonZh || "")}</p>
  </article>`;
}

function compactIndustryScore(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${Number(value ?? 0)}</strong></div>`;
}

function industryScoreBadge(item) {
  const score = Number(item.overallScore ?? 0);
  const grade = score >= 85 ? "a" : score >= 75 ? "b" : score >= 60 ? "c" : "d";
  return `<span class="score-badge grade-${grade}">${score}</span>`;
}

function renderIndustryScores(item) {
  return `<div class="detail-score-grid">
    ${detailScore("研究匹配", item.fitScore)}
    ${detailScore("薪资吸引力", item.salaryScore)}
    ${detailScore("岗位供给", item.supplyScore)}
    ${detailScore("入职可行性", item.feasibilityScore)}
    ${detailScore("身份/语言风险", item.identityRisk, true)}
  </div>`;
}

function detailScore(label, value, inverse = false) {
  const score = Number(value ?? 0);
  return `<div><span>${escapeHtml(label)}</span><strong>${score}</strong><div class="mini-bar ${inverse ? "risk" : ""}"><i style="width:${Math.max(0, Math.min(100, score))}%"></i></div></div>`;
}

function renderIndustryPrivateGap(privatePlan) {
  if (!privatePlan) return "";
  return `<section class="private-gap-band">
    <div class="section-head"><div><p class="eyebrow">Private · Personal Gap</p><h2>个人差距与行动路线</h2></div><span class="trust-label">仅私有版</span></div>
    <p>${escapeHtml(privatePlan.summaryZh || "")}</p>
    <div class="readiness-grid">${(privatePlan.readiness ?? []).map((item) => `
      <div class="readiness-row"><span>${escapeHtml(item.name || "")}</span><strong>${Number(item.score ?? 0)}</strong><div class="mini-bar"><i style="width:${Number(item.score ?? 0)}%"></i></div><small>${escapeHtml(item.statusZh || "")}</small></div>
    `).join("")}</div>
    <div class="private-timeline">${(privatePlan.timeline ?? []).map((item) => `<div><strong>${escapeHtml(item.period || "")}</strong><span>${escapeHtml(item.focusZh || "")}</span></div>`).join("")}</div>
  </section>`;
}

function renderPublicGapNotice() {
  return `<section class="public-gap-notice">
    <div><p class="eyebrow">05 · Personal Gap</p><h2>个人差距保留在私有版</h2></div>
    <p>公开版只展示通用技能需求，不包含论文进度、GitHub 差距、联系记录或申请状态。</p>
  </section>`;
}

function jobCard(job) {
  return `
    <article class="opportunity-card">
      <div class="card-top"><span>${scoreBadge(job)} ${freshnessBadge(job)}</span><span class="trust">${escapeHtml(job.sourceTrustLabelZh || "")}</span></div>
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
      <td><div class="title-with-status">${freshnessBadge(job)}<button class="row-title" data-job-id="${escapeAttr(job.id)}">${escapeHtml(job.title)}</button></div><div class="table-note">${escapeHtml(job.ai?.summaryZh || job.simpleReason || "")}</div></td>
      <td>${escapeHtml(job.institution || job.sourceName || "")}</td>
      <td>${escapeHtml(job.region || "")}</td>
      <td>${escapeHtml(job.roleLabelZh || "")}</td>
      <td>${tagList(job.matchedKeywords ?? job.keywords ?? [])}</td>
      <td>${escapeHtml(job.deadline || (job.evergreen ? "长期关注" : "未知"))}</td>
      <td>${lifecycleBadge(job)}</td>
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

function industryFilterInput(name, label, placeholder) {
  return `<label class="filter-control"><span>${escapeHtml(label)}</span><input data-industry-filter="${escapeAttr(name)}" value="${escapeAttr(state.industryFilters[name])}" placeholder="${escapeAttr(placeholder)}"></label>`;
}

function industryFilterSelect(name, label, options) {
  return `<label class="filter-control"><span>${escapeHtml(label)}</span><select data-industry-filter="${escapeAttr(name)}"><option value="">全部</option>${options.map(([value, text]) => `<option value="${escapeAttr(value)}" ${state.industryFilters[name] === value ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>`;
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

function renderIndustryLocalTracking(kind, id) {
  const key = `${kind}:${id}`;
  const record = readIndustryTracking()[key] ?? {};
  const stages = ["待研究", "准备中", "已收藏", "已联系", "已投递", "面试", "Offer", "拒绝", "暂停"];
  return `<div class="local-tracking" data-local-tracking-key="${escapeAttr(key)}">
    <label><span>状态</span><select data-local-stage>${stages.map((stage) => `<option value="${escapeAttr(stage)}" ${record.stage === stage ? "selected" : ""}>${escapeHtml(stage)}</option>`).join("")}</select></label>
    <label><span>提醒日期</span><input type="date" data-local-reminder value="${escapeAttr(record.reminder || "")}"></label>
    <label class="wide"><span>私人备注</span><textarea data-local-notes rows="3">${escapeHtml(record.notes || "")}</textarea></label>
    <button class="tiny-button primary" data-save-local-tracking>保存到本机</button>
    <small data-local-save-status>只保存在当前浏览器。</small>
  </div>`;
}

function bindLocalTrackingControls() {
  const container = els.drawer.querySelector("[data-local-tracking-key]");
  const button = container?.querySelector("[data-save-local-tracking]");
  if (!container || !button) return;
  button.addEventListener("click", () => {
    const all = readIndustryTracking();
    all[container.dataset.localTrackingKey] = {
      stage: container.querySelector("[data-local-stage]")?.value || "待研究",
      reminder: container.querySelector("[data-local-reminder]")?.value || "",
      notes: container.querySelector("[data-local-notes]")?.value || "",
      updatedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem("industry-tracking-v1", JSON.stringify(all));
      const status = container.querySelector("[data-local-save-status]");
      if (status) status.textContent = "已保存到本机。";
    } catch {
      const status = container.querySelector("[data-local-save-status]");
      if (status) status.textContent = "浏览器未允许保存。";
    }
  });
}

function readIndustryTracking() {
  try {
    return JSON.parse(localStorage.getItem("industry-tracking-v1") || "{}");
  } catch {
    return {};
  }
}

function scoreBadge(job) {
  return `<span class="score-badge grade-${escapeAttr((job.priority || "d").toLowerCase())}">${escapeHtml(job.priority || "D")} ${Number(job.matchScore ?? 0)}</span>`;
}

function freshnessBadge(record) {
  const freshness = record?.freshness;
  if (!freshness) return "";
  const muted = freshness.type === "expired" && !freshness.highlighted ? " is-muted" : "";
  return `<span class="freshness-badge freshness-${escapeAttr(freshness.type)}${muted}">${escapeHtml(freshness.labelZh || "")}</span>`;
}

function lifecycleBadge(job) {
  const status = job.lifecycleStatus || "active";
  const labels = {
    active: "当前有效",
    watchlist: "长期关注",
    expired: "已失效/已截止"
  };
  return `<span class="lifecycle-badge lifecycle-${escapeAttr(status)}">${escapeHtml(job.lifecycleLabelZh || labels[status] || "待核验")}</span>`;
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

function freshnessMatches(job, filter) {
  if (filter === "new" || filter === "updated") return job.freshness?.type === filter;
  if (filter === "expired") return job.lifecycleStatus === "expired";
  if (filter === "active") return job.lifecycleStatus !== "expired";
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
    academic: fallbackAcademic(),
    industry: fallbackIndustry(),
    routes: [],
    sources: [],
    calendar: {}
  };
}

function fallbackAcademic() {
  return {
    schemaVersion: 0,
    profiles: [],
    overview: {},
    recruitmentSignalTypes: [],
    publicationPolicy: {}
  };
}

function fallbackIndustry() {
  return {
    updatedAt: "",
    sourcePolicyZh: "所有申请前必须回到官方原始链接核验。",
    companies: [],
    opportunities: [],
    people: [],
    salaryBenchmarks: [],
    skillDemand: [],
    anonymousPaths: []
  };
}
