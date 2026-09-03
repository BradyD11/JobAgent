const $ = (s) => document.querySelector(s);

let profile = null;
let tabId = null;

function say(text, cls, keys) {
  const el = $("#msg");
  el.className = cls || "";
  el.innerHTML = text + (keys && keys.length
    ? `<ul class="keys">${keys.map((k) => `<li>${k.replace(/_/g, " ")}</li>`).join("")}</ul>`
    : "");
  el.hidden = false;
}

async function loadProfile(announce) {
  const r = await chrome.runtime.sendMessage({ type: "JOBAGENT_GET_PROFILE" });
  if (!r || !r.ok) {
    profile = null;
    $("#fill").disabled = true;
    say("No profile available. Start the dashboard with "
      + "<b>python3 -m jobagent serve</b> and make sure <b>profile.json</b> exists.", "warn");
    return;
  }
  profile = r.profile;
  const n = Object.values(profile).filter((v) => v !== "" && v != null).length;
  if (announce) {
    say(`Profile reloaded — <b>${n}</b> fields ready`
        + (r.source === "cache" ? " (from cache)" : "") + ".", "ok");
  }
}

async function probe() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  try {
    $("#host").textContent = new URL(tab.url).host;
  } catch { /* chrome:// pages have no useful host */ }

  try {
    const r = await chrome.tabs.sendMessage(tabId, { type: "JOBAGENT_PROBE" });
    if (r?.ok && r.fillable > 0) {
      $("#sub").textContent = `${r.fillable} field${r.fillable === 1 ? "" : "s"} can be filled here.`;
      $("#fill").disabled = !profile;
    } else {
      $("#sub").textContent = "No matching fields found on this page.";
      $("#fill").disabled = true;
    }

    // The page may hold values typed since the last flush; bank them now so
    // opening the popup never loses what was just entered.
    const f = await chrome.tabs.sendMessage(tabId, { type: "JOBAGENT_FLUSH" });
    if (f?.ok && Object.keys(f.values || {}).length) {
      await chrome.runtime.sendMessage({
        type: "JOBAGENT_LEARN", values: f.values, corrected: f.corrected || [],
      });
      await loadProfile(false);
    }
  } catch {
    $("#sub").textContent = "Not an application page this extension covers.";
    $("#fill").disabled = true;
  }

  renderLearned();
}

const LABELS = {
  work_authorized: "Work auth",
  requires_sponsorship: "Sponsorship",
  veteran_status: "Veteran",
  disability_status: "Disability",
  graduation_year: "Grad year",
  graduation_month: "Grad month",
  how_did_you_hear: "Heard via",
  first_name: "First name",
  last_name: "Last name",
  full_name: "Full name",
  gpa: "GPA",
  linkedin: "LinkedIn",
  github: "GitHub",
  zip: "ZIP",
};

/** Human label for a profile key, sentence-cased when not spelled out above. */
function label(k) {
  if (LABELS[k]) return LABELS[k];
  const words = k.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

async function renderLearned() {
  const { recent = [], queued = {} } =
    await chrome.runtime.sendMessage({ type: "JOBAGENT_GET_RECENT" }) || {};

  const section = $("#learned");
  const list = $("#learnedList");
  const queuedKeys = Object.keys(queued);

  if (!recent.length && !queuedKeys.length) {
    section.hidden = true;
    return;
  }

  $("#learnedTitle").textContent = queuedKeys.length
    ? `Waiting to save — start the JobAgent server`
    : "Remembered from your applications";

  const rows = queuedKeys.length
    ? queuedKeys.map((k) => ({ key: k, value: queued[k] }))
    : recent;

  list.innerHTML = rows.map((r) => `
    <li>
      <span class="k">${esc(label(r.key))}</span>
      <span class="v" title="${esc(r.value)}">${esc(r.value)}</span>
      ${queuedKeys.length ? "" : `<button class="forget" data-key="${esc(r.key)}"
        title="Forget this" aria-label="Forget ${esc(label(r.key))}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>`}
    </li>`).join("");

  list.querySelectorAll(".forget").forEach((b) => {
    b.onclick = async () => {
      const r = await chrome.runtime.sendMessage({
        type: "JOBAGENT_FORGET", key: b.dataset.key,
      });
      if (r?.ok) { await loadProfile(false); renderLearned(); }
      else say(`Could not forget that — ${r?.error || "server unreachable"}`, "warn");
    };
  });

  section.hidden = false;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

$("#fill").addEventListener("click", async () => {
  if (!profile || tabId == null) return;
  $("#fill").disabled = true;
  const r = await chrome.tabs.sendMessage(tabId, { type: "JOBAGENT_FILL", profile });
  if (!r?.ok) {
    say(`Could not fill this page. ${r?.error || ""}`, "warn");
    $("#fill").disabled = false;
    return;
  }
  if (!r.filled.length) {
    say("Nothing to fill — the fields are already filled in.", "");
  } else {
    say(`Filled <b>${r.filled.length}</b> field${r.filled.length === 1 ? "" : "s"}. `
        + "Review everything before you submit.", "ok", r.filled);
  }
});

$("#reload").addEventListener("click", () => loadProfile(true));

loadProfile(false).then(probe);
