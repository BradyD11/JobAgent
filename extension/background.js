/* Bridges the extension to the local JobAgent server: reads the profile for
   autofill, and writes back values learned from forms the user fills by hand. */

const HOSTS = ["http://127.0.0.1:5137", "http://localhost:5137"];

/** Try each host in turn; the first that answers wins. */
async function callServer(path, init) {
  let lastError = null;
  for (const host of HOSTS) {
    try {
      const r = await fetch(host + path, { cache: "no-store", ...init });
      if (!r.ok) { lastError = new Error(`${r.status} ${r.statusText}`); continue; }
      return await r.json();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("JobAgent server unreachable");
}

async function fetchProfile() {
  try {
    const profile = await callServer("/api/profile");
    await chrome.storage.local.set({ profile, fetchedAt: Date.now() });
    return { ok: true, profile, source: "server" };
  } catch {
    const { profile } = await chrome.storage.local.get("profile");
    return profile
      ? { ok: true, profile, source: "cache" }
      : { ok: false, error: "JobAgent server unreachable and no cached profile." };
  }
}

/** Merge values a user typed into a form back into profile.json. */
async function learn(values, corrected = []) {
  if (!values || !Object.keys(values).length) return { ok: true, learned: {} };
  try {
    const r = await callServer("/api/profile/learn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values, corrected }),
    });
    const changed = { ...(r.learned || {}), ...(r.corrected || {}) };
    if (Object.keys(changed).length) {
      // Refresh the cache so the next fill uses what was just learned.
      await fetchProfile();
      await rememberRecent(changed);
    }
    return r;
  } catch (e) {
    // The server is down: hold the values until it is back.
    const { queued = {} } = await chrome.storage.local.get("queued");
    await chrome.storage.local.set({ queued: { ...queued, ...values } });
    return { ok: false, error: String(e), queued: true };
  }
}

/** Keep a short list of what was learned, so the popup can show it. */
async function rememberRecent(learned) {
  const { recent = [] } = await chrome.storage.local.get("recent");
  const at = Date.now();
  const merged = Object.entries(learned).map(([key, value]) => ({ key, value, at }));
  for (const old of recent) {
    if (!merged.some((m) => m.key === old.key)) merged.push(old);
  }
  await chrome.storage.local.set({ recent: merged.slice(0, 12) });
}

/** Anything captured while the server was down goes up on the next chance. */
async function drainQueue() {
  const { queued } = await chrome.storage.local.get("queued");
  if (!queued || !Object.keys(queued).length) return;
  const r = await learn(queued);
  if (r.ok) await chrome.storage.local.remove("queued");
}

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg.type === "JOBAGENT_GET_PROFILE") {
    drainQueue().then(fetchProfile).then(respond);
    return true;
  }
  if (msg.type === "JOBAGENT_LEARN") {
    learn(msg.values, msg.corrected).then(respond);
    return true;
  }
  if (msg.type === "JOBAGENT_GET_RECENT") {
    chrome.storage.local.get(["recent", "queued"]).then((d) =>
      respond({ ok: true, recent: d.recent || [], queued: d.queued || {} }));
    return true;
  }
  if (msg.type === "JOBAGENT_FORGET") {
    callServer("/api/profile/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: msg.key, value: "" }),
    })
      .then(async () => {
        const { recent = [] } = await chrome.storage.local.get("recent");
        await chrome.storage.local.set({
          recent: recent.filter((r) => r.key !== msg.key),
        });
        await fetchProfile();
        respond({ ok: true });
      })
      .catch((e) => respond({ ok: false, error: String(e) }));
    return true;
  }
});
