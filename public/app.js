const state = {
  jobs: [],
  people: [],
  sources: [],
  alerts: [],
  metadata: {},
  filters: {
    search: "",
    region: "",
    role: "",
    priority: ""
  }
};

const els = {
  metadata: document.querySelector("#metadata"),
  metricAlerts: document.querySelector("#metric-alerts"),
  metricJobs: document.querySelector("#metric-jobs"),
  metricSources: document.querySelector("#metric-sources"),
  metricPeople: document.querySelector("#metric-people"),
  searchInput: document.querySelector("#search-input"),
  regionFilter: document.querySelector("#region-filter"),
  roleFilter: document.querySelector("#role-filter"),
  priorityFilter: document.querySelector("#priority-filter"),
  jobsBody: document.querySelector("#jobs-body"),
  peopleBody: document.querySelector("#people-body"),
  sourcesBody: document.querySelector("#sources-body"),
  calendarList: document.querySelector("#calendar-list")
};

await init();

async function init() {
  const [jobs, people, sources, alerts, metadata] = await Promise.all([
    fetchJson("./data/jobs.json", []),
    fetchJson("./data/people.json", []),
    fetchJson("./data/sources.json", []),
    fetchJson("./data/alerts.json", []),
    fetchJson("./data/metadata.json", {})
  ]);

  state.jobs = jobs;
  state.people = people;
  state.sources = sources;
  state.alerts = alerts;
  state.metadata = metadata;

  bindEvents();
  populateFilters();
  render();
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

function bindEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.filters.search = event.target.value.trim().toLowerCase();
    renderJobs();
  });
  els.regionFilter.addEventListener("change", (event) => {
    state.filters.region = event.target.value;
    renderJobs();
  });
  els.roleFilter.addEventListener("change", (event) => {
    state.filters.role = event.target.value;
    renderJobs();
  });
  els.priorityFilter.addEventListener("change", (event) => {
    state.filters.priority = event.target.value;
    renderJobs();
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
      button.classList.add("active");
      document.querySelector(`#view-${button.dataset.view}`).classList.add("active");
    });
  });
}

function populateFilters() {
  for (const region of uniqueSorted(state.jobs.map((job) => job.region).filter(Boolean))) {
    els.regionFilter.append(new Option(region, region));
  }
  for (const role of uniqueSorted(state.jobs.map((job) => job.roleType).filter(Boolean))) {
    els.roleFilter.append(new Option(role.replaceAll("_", " "), role));
  }
}

function render() {
  els.metadata.textContent = state.metadata.generatedAt
    ? `Generated ${formatDateTime(state.metadata.generatedAt)}`
    : "No generated data";
  els.metricAlerts.textContent = state.alerts.length;
  els.metricJobs.textContent = state.jobs.length;
  els.metricSources.textContent = state.sources.length;
  els.metricPeople.textContent = state.people.length;
  renderJobs();
  renderPeople();
  renderSources();
  renderCalendar();
}

function renderJobs() {
  const jobs = filteredJobs();
  if (jobs.length === 0) {
    els.jobsBody.innerHTML = `<tr><td colspan="6" class="empty">No matching opportunities</td></tr>`;
    return;
  }
  els.jobsBody.innerHTML = jobs.map((job) => `
    <tr>
      <td>
        <span class="badge badge-${escapeHtml((job.priority || "d").toLowerCase())}">${escapeHtml(job.priority || "D")}</span>
        <div class="subline">${Number(job.matchScore ?? 0)}/100</div>
      </td>
      <td>
        <a class="title-link" href="${escapeAttr(job.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(job.title)}</a>
        <div class="subline">${escapeHtml(job.institution || job.sourceName || "")}</div>
      </td>
      <td>${escapeHtml(job.region || "")}</td>
      <td>${escapeHtml((job.roleType || "").replaceAll("_", " "))}</td>
      <td>${escapeHtml(job.deadline || (job.evergreen ? "watchlist" : ""))}</td>
      <td><div class="tag-list">${tagList(job.matchedKeywords || job.keywords || [])}</div></td>
    </tr>
  `).join("");
}

function renderPeople() {
  if (state.people.length === 0) {
    els.peopleBody.innerHTML = `<tr><td colspan="5" class="empty">No public career profiles yet</td></tr>`;
    return;
  }
  els.peopleBody.innerHTML = state.people.map((person) => `
    <tr>
      <td><a class="title-link" href="${escapeAttr(person.homepage || "#")}" target="_blank" rel="noreferrer">${escapeHtml(person.name)}</a></td>
      <td>${escapeHtml(person.currentPosition || "")}<div class="subline">${escapeHtml(person.currentInstitution || "")}</div></td>
      <td>${escapeHtml(person.phdInstitution || "")}<div class="subline">${escapeHtml(person.phdYear || "")}</div></td>
      <td><div class="tag-list">${tagList(person.fieldTags || [])}</div></td>
      <td>${escapeHtml(person.confidence || "")}</td>
    </tr>
  `).join("");
}

function renderSources() {
  if (state.sources.length === 0) {
    els.sourcesBody.innerHTML = `<tr><td colspan="6" class="empty">No sources configured</td></tr>`;
    return;
  }
  els.sourcesBody.innerHTML = state.sources.map((source) => {
    const statusClass = source.status === "ok" ? "status-ok" : source.status === "error" ? "status-error" : "status-muted";
    return `
      <tr>
        <td class="${statusClass}">${escapeHtml(source.status || "")}</td>
        <td><a class="title-link" href="${escapeAttr(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.name)}</a><div class="subline">${escapeHtml(source.message || "")}</div></td>
        <td>${escapeHtml(source.region || "")}</td>
        <td>${escapeHtml(source.trust || "")}</td>
        <td>${Number(source.count ?? 0)}</td>
        <td>${source.checkedAt ? escapeHtml(formatDateTime(source.checkedAt)) : ""}</td>
      </tr>
    `;
  }).join("");
}

function renderCalendar() {
  const fellowships = state.jobs.filter((job) => job.roleType === "fellowship" || job.track === "fellowship").slice(0, 12);
  if (fellowships.length === 0) {
    els.calendarList.innerHTML = `<div class="empty">No fellowship records yet</div>`;
    return;
  }
  els.calendarList.innerHTML = fellowships.map((job) => `
    <article class="calendar-item">
      <h3><a class="title-link" href="${escapeAttr(job.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(job.title)}</a></h3>
      <p>${escapeHtml(job.institution || "")}</p>
      <p>${escapeHtml(job.deadline || "annual / rolling watch")}</p>
    </article>
  `).join("");
}

function filteredJobs() {
  const { search, region, role, priority } = state.filters;
  return state.jobs.filter((job) => {
    const text = [
      job.title,
      job.institution,
      job.region,
      job.roleType,
      job.description,
      ...(job.matchedKeywords || []),
      ...(job.keywords || [])
    ].join(" ").toLowerCase();
    return (!search || text.includes(search))
      && (!region || job.region === region)
      && (!role || job.roleType === role)
      && (!priority || job.priority === priority);
  });
}

function tagList(values) {
  return uniqueSorted(values).slice(0, 6).map((value) => `<span class="tag">${escapeHtml(value)}</span>`).join("");
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
}

function formatDateTime(value) {
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
