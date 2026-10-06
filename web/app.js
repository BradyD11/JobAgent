/* JobAgent dashboard — triage-first client.
   Everything renders from one in-memory list; filtering and sorting stay
   local so typing never waits on the network. */

const $ = (sel) => document.querySelector(sel);

const STATUSES = ["new", "saved", "applied", "interviewing", "rejected"];

const state = {
  jobs: [],
  stats: null,
  metro: null,
  status: null,
  source: null,
  q: "",
  sort: "posted",
  dir: "desc",
  loading: true,
};

/* ---------- icons (drawn, one stroke weight) ---------- */

const icon = (paths, w = 14) =>
  `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

const ICON = {
  star: icon('<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"/>'),
  check: icon('<path d="M20 6 9 17l-5-5"/>'),
  x: icon('<path d="M18 6 6 18M6 6l12 12"/>'),
  ext: icon('<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', 12),
  empty: icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 30),
};

/* ---------- data ---------- */

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function loadJobs() {
  const [j, s] = await Promise.all([api("/api/jobs?limit=2000"), api("/api/stats")]);
  state.jobs = j.jobs;
  state.stats = s;
  state.loading = false;
  renderFilters();
  render();
  renderFooter();
}

/* Auto-refresh stale sources on load, then reload if anything new arrived. */
async function autoRefresh() {
  setRefreshing(true);
  try {
    const r = await api("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stale_only: true }),
    });
    const rep = r.report || {};
    if (rep.new || rep.updated) await loadJobs();
    if (rep.new) toast(`${rep.new} new listing${rep.new === 1 ? "" : "s"}`);
  } catch {
    /* Offline is fine — the stored jobs are already on screen. */
  } finally {
    setRefreshing(false);
  }
}

async function manualRefresh() {
  setRefreshing(true);
  try {
    const r = await api("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stale_only: false }),
    });
    await loadJobs();
    const rep = r.report || {};
    toast(rep.new ? `${rep.new} new, ${rep.updated} updated` : "Up to date");
  } catch (e) {
    toast(`Refresh failed — ${e.message}`);
  } finally {
    setRefreshing(false);
  }
}

function setRefreshing(on) {
  const btn = $("#refresh");
  btn.disabled = on;
  btn.querySelector("svg").classList.toggle("spin", on);
  $("#refreshLabel").textContent = on ? "Fetching…" : "Refresh";
}

/* ---------- filtering ---------- */

function visible() {
  const q = state.q.trim().toLowerCase();
  let out = state.jobs.filter((j) => {
    if (state.metro && !j.metros.includes(state.metro)) return false;
    if (state.status && j.status !== state.status) return false;
    if (state.source && !j.source.includes(state.source)) return false;
    if (q && !(`${j.company} ${j.title}`.toLowerCase().includes(q))) return false;
    return true;
  });

  const k = state.sort, sign = state.dir === "asc" ? 1 : -1;
  out.sort((a, b) => {
    let x = a[k], y = b[k];
    if (k === "metros") { x = (x || []).join(); y = (y || []).join(); }
    // Missing values sort last regardless of direction.
    if (!x && !y) return 0;
    if (!x) return 1;
    if (!y) return -1;
    return String(x).localeCompare(String(y), undefined, { numeric: true }) * sign;
  });
  return out;
}

/* ---------- render ---------- */

function renderFilters() {
  const s = state.stats;
  if (!s) return;

  const build = (el, items, key) => {
    el.querySelectorAll(".chip").forEach((c) => c.remove());
    items.forEach(({ label, value, n }) => {
      const b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b.setAttribute("aria-pressed", String(state[key] === value));
      b.innerHTML = `${label}${n != null ? ` <span class="n">${n}</span>` : ""}`;
      b.onclick = () => {
        state[key] = state[key] === value ? null : value;
        renderFilters();
        render();
      };
      el.appendChild(b);
    });
  };

  build($("#metroGroup"),
    [{ label: "All", value: null, n: s.total }].concat(
      (s.metros || []).map((m) => ({ label: m, value: m, n: s.by_metro[m] || 0 }))),
    "metro");

  build($("#statusGroup"),
    [{ label: "Any", value: null }].concat(
      STATUSES.map((st) => ({
        label: st[0].toUpperCase() + st.slice(1),
        value: st,
        n: s.by_status[st] || 0,
      }))),
    "status");

  build($("#sourceGroup"),
    [{ label: "All", value: null }].concat(
      (s.sources_available || []).map((src) => ({ label: src, value: src }))),
    "source");
}

function render() {
  const tbody = $("#rows");
  const stateEl = $("#state");

  if (state.loading) {
    tbody.innerHTML = Array.from({ length: 12 }, () =>
      `<tr class="skeleton-row">
         <td><span style="width:110px"></span></td>
         <td><span style="width:60%"></span></td>
         <td class="loc"><span style="width:80px"></span></td>
         <td class="src"><span style="width:60px"></span></td>
         <td class="pay"><span style="width:50px"></span></td>
         <td class="date"><span style="width:60px"></span></td>
         <td class="act"></td>
       </tr>`).join("");
    stateEl.innerHTML = "";
    return;
  }

  const rows = visible();
  $("#shown").textContent = `${rows.length} of ${state.jobs.length}`;
  $("#brandCount").textContent = state.jobs.length ? `${state.jobs.length} listings` : "";

  if (!rows.length) {
    tbody.innerHTML = "";
    const filtered = state.metro || state.status || state.source || state.q;
    stateEl.innerHTML = `
      <div class="state">
        ${ICON.empty}
        <h2>${filtered ? "No listings match these filters" : "No listings yet"}</h2>
        <p>${filtered
            ? "Try clearing a filter, or widen the search."
            : "Hit Refresh to pull from Simplify, LinkedIn, Jobright and Work at a Startup."}</p>
      </div>`;
    return;
  }

  stateEl.innerHTML = "";
  tbody.innerHTML = rows.map(rowHTML).join("");
  tbody.querySelectorAll("[data-act]").forEach((b) => {
    b.onclick = () => setStatus(b.dataset.id, b.dataset.act);
  });
}

function rowHTML(j) {
  const tags = [];
  if (j.status !== "new") {
    tags.push(`<span class="tag tag-${j.status}">${j.status}</span>`);
  }
  if (j.sponsorship === "Does Not Offer Sponsorship") {
    tags.push(`<span class="tag" title="Does not offer sponsorship">No spon</span>`);
  }

  const saved = j.status === "saved";
  const applied = j.status === "applied";

  return `<tr class="${j.status === "new" ? "is-new" : ""}">
    <td class="co" title="${esc(j.company)}"><span>${esc(j.company)}</span></td>
    <td class="ti" title="${esc(j.title)}"><div class="rolewrap"><span class="role">${
      esc(j.title)}</span>${j.salary ? `<span class="pay-inline">${
      esc(shortPay(j.salary))}</span>` : ""}${tags.join("")}</div></td>
    <td class="loc" title="${esc(j.location || "")}"><span>${
      esc((j.metros || []).join(", "))}</span></td>
    <td class="src"><span class="tag">${esc(j.source.replace(/WorkAtAStartup/g, "YC"))}</span></td>
    <td class="pay">${esc(termOf(j))}</td>
    <td class="date">${esc(j.posted || "")}</td>
    <td class="act">
      <span class="rowacts">
        <button class="icon-btn ${saved ? "on" : ""}" data-act="${saved ? "new" : "saved"}"
                data-id="${j.job_id}" title="${saved ? "Unsave" : "Save"}"
                aria-label="${saved ? "Unsave" : "Save"}">${ICON.star}</button>
        <button class="icon-btn ${applied ? "on" : ""}" data-act="${applied ? "new" : "applied"}"
                data-id="${j.job_id}" title="${applied ? "Mark not applied" : "Mark applied"}"
                aria-label="Mark applied">${ICON.check}</button>
        <button class="icon-btn" data-act="dismissed" data-id="${j.job_id}"
                title="Dismiss" aria-label="Dismiss">${ICON.x}</button>
      </span>
      ${j.url ? `<a class="apply" href="${esc(j.url)}" target="_blank" rel="noopener"
                    data-jobagent-apply="1">Apply ${ICON.ext}</a>` : ""}
    </td>
  </tr>`;
}

/* Term (Summer 2027) is present on ~80% of rows. Salary now shows beside the
   role instead of falling back into this column. */
function termOf(j) {
  if (j.summary && /\b(Summer|Fall|Winter|Spring)\b/.test(j.summary)) {
    return j.summary.split(",")[0].trim();
  }
  return "";
}

/* Sources write pay a dozen ways ("$65K/yr - $70K/yr", "$8K - $12K / monthly").
   Compress to one short token so it sits inline without crowding the title. */
function shortPay(raw) {
  const s = String(raw).trim();
  const nums = s.match(/\$[\d.,]+\s*[KkMm]?/g);
  if (!nums || !nums.length) return s.length > 16 ? s.slice(0, 15) + "…" : s;
  const norm = (n) => n.replace(/\s+/g, "").toUpperCase();
  const range = nums.length > 1 ? `${norm(nums[0])}–${norm(nums[1])}` : norm(nums[0]);
  const per = /month/i.test(s) ? "/mo"
            : /hour|\bhr\b/i.test(s) ? "/hr"
            : /year|\byr\b/i.test(s) ? "/yr" : "";
  return range + per;
}

function renderFooter() {
  const s = state.stats;
  if (!s) return;
  const bad = (s.sources || []).filter((r) => !r.ok);
  $("#health").classList.toggle("bad", bad.length > 0);
  const parts = (s.sources || []).map((r) =>
    `${r.source.replace("WorkAtAStartup", "YC")} ${r.ok ? r.job_count : "—"}`);
  $("#sourceLine").textContent = parts.length
    ? parts.join("  ·  ") + (bad.length ? `  ·  ${bad.length} source failing` : "")
    : "No sources fetched yet";
}

/* ---------- actions ---------- */

let undoTimer;

async function setStatus(jobId, status, silent = false) {
  const job = state.jobs.find((j) => j.job_id === jobId);
  if (!job) return;
  const prev = job.status;

  // Optimistic: the row updates now, the request catches up.
  if (status === "dismissed") {
    state.jobs = state.jobs.filter((j) => j.job_id !== jobId);
  } else {
    job.status = status;
  }
  render();

  try {
    await api(`/api/jobs/${jobId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (state.stats) {
      state.stats.by_status[prev] = Math.max(0, (state.stats.by_status[prev] || 1) - 1);
      state.stats.by_status[status] = (state.stats.by_status[status] || 0) + 1;
      renderFilters();
    }
    if (!silent) {
      const label = status === "dismissed" ? "Dismissed" : `Marked ${status}`;
      toast(`${label} · ${job.company}`, () => {
        if (status === "dismissed") state.jobs.push(job);
        setStatus(jobId, prev, true);
      });
    }
  } catch (e) {
    if (status === "dismissed") state.jobs.push(job);
    job.status = prev;
    render();
    toast(`Could not save — ${e.message}`);
  }
}

function toast(msg, undo) {
  clearTimeout(undoTimer);
  $("#toastMsg").textContent = msg;
  const btn = $("#toastUndo");
  btn.hidden = !undo;
  btn.onclick = undo
    ? () => { $("#toast").hidden = true; undo(); }
    : null;
  $("#toast").hidden = false;
  undoTimer = setTimeout(() => { $("#toast").hidden = true; }, undo ? 5200 : 2600);
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- wiring ---------- */

let qTimer;
$("#q").addEventListener("input", (e) => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { state.q = e.target.value; render(); }, 110);
});

$("#refresh").addEventListener("click", manualRefresh);

document.querySelectorAll("th.sortable").forEach((th) => {
  th.addEventListener("click", () => {
    const k = th.dataset.sort;
    state.dir = state.sort === k && state.dir === "desc" ? "asc" : "desc";
    state.sort = k;
    document.querySelectorAll("th.sortable").forEach((o) => o.removeAttribute("data-dir"));
    th.setAttribute("data-dir", state.dir);
    th.querySelector(".arrow").textContent = state.dir === "desc" ? "↓" : "↑";
    render();
  });
});

// "/" focuses the filter, the way a list tool should.
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
    e.preventDefault();
    $("#q").focus();
  }
  if (e.key === "Escape" && document.activeElement === $("#q")) {
    $("#q").value = ""; state.q = ""; render(); $("#q").blur();
  }
});

render();
loadJobs().then(autoRefresh);
