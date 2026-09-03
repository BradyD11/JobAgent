/* JobAgent autofill — runs on ATS application pages.

   Design rules:
   - Never submits. Filling is the whole job; the user reviews and sends.
   - Never fills passwords, government IDs, payment fields, or free-text
     essays (see NEVER_FILL in fields.js).
   - Dispatches real input/change events so React/Vue forms register values.
   - Marks every field it touched so the user can see what was machine-filled.
*/

(() => {
  if (window.__jobagentLoaded) return;
  window.__jobagentLoaded = true;

  const MARK = "data-jobagent-filled";

  /* ---------- context extraction ---------- */

  /** Everything textual that describes a field, joined for matching. */
  function contextOf(el) {
    const bits = [
      el.name, el.id, el.placeholder, el.getAttribute("aria-label"),
      el.getAttribute("autocomplete"), el.getAttribute("data-qa"),
      el.getAttribute("data-automation-id"),
    ];

    if (el.labels) for (const l of el.labels) bits.push(l.textContent);

    const by = el.getAttribute("aria-labelledby");
    if (by) {
      for (const id of by.split(/\s+/)) {
        const n = document.getElementById(id);
        if (n) bits.push(n.textContent);
      }
    }

    // Walk up for a wrapping label or field group, as Greenhouse and
    // Workday often place the label in an ancestor rather than a <label for>.
    // Stop at containers holding several *distinct* fields: their text belongs
    // to the form, not this input, and borrowing it mislabels every field.
    // A radio/checkbox is the exception -- its question lives in the group's
    // legend, one level above its own "Yes"/"No" label -- so for those we keep
    // climbing until the group container is found.
    const grouped = el.type === "radio" || el.type === "checkbox";
    let node = el.parentElement, hops = 0;
    while (node && hops++ < 5) {
      if (node.tagName === "FORM") break;

      if (node.tagName === "LABEL") {
        bits.push(node.textContent);
        if (!grouped) break;
        node = node.parentElement;
        continue;
      }

      // Count only fields outside this element's own group.
      const owned = [...node.querySelectorAll("input, select, textarea")]
        .filter((o) => !(grouped && o.type === el.type && o.name === el.name));

      if (owned.length > 0) {
        const lbl = node.querySelector(":scope > legend, :scope > label, :scope > .label");
        if (lbl && grouped) bits.push(lbl.textContent);
        break;
      }

      const lbl = node.querySelector(":scope > legend, :scope > label, :scope > .label");
      if (lbl) {
        bits.push(lbl.textContent);
        if (!grouped) break;
      }
      node = node.parentElement;
    }
    return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 300);
  }

  function keyFor(ctx) {
    if (NEVER_FILL.some((r) => r.test(ctx))) return null;
    for (const [key, pats] of FIELD_RULES) {
      if (pats.some((r) => r.test(ctx))) return key;
    }
    return null;
  }

  /* ---------- value setting ---------- */

  /** Set a value the way a user would, so framework listeners fire.

     The element is marked before the events fire: those events reach our own
     observer, and an unmarked element there would be mistaken for something
     the user typed and learned straight back. */
  function setNative(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    el.setAttribute(MARK, "1");
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillText(el, value) {
    if (!value || el.value) return false;   // never overwrite the user
    el.focus({ preventScroll: true });
    setNative(el, value);
    el.blur();
    return true;
  }

  /** Pick the option whose text best matches the value. */
  function fillSelect(el, value) {
    if (!value || (el.value && el.selectedIndex > 0)) return false;
    const want = String(value).toLowerCase().trim();
    const opts = [...el.options];

    let hit = opts.find((o) => o.text.toLowerCase().trim() === want)
           || opts.find((o) => o.value.toLowerCase().trim() === want);
    if (!hit) {
      hit = opts.find((o) => {
        const t = o.text.toLowerCase();
        return t && t !== "" && (t.includes(want) || want.includes(t));
      });
    }
    if (!hit) return false;
    el.focus({ preventScroll: true });
    el.setAttribute(MARK, "1");
    el.value = hit.value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
    return true;
  }

  /** The text that labels one radio option ("Yes" / "No"), not its question. */
  function optionText(el) {
    const bits = [el.value, el.getAttribute("aria-label")];
    if (el.labels) for (const l of el.labels) bits.push(l.textContent);
    const wrap = el.closest("label");
    if (wrap) bits.push(wrap.textContent);
    // A radio is often followed by its own text node or span.
    if (el.nextSibling) bits.push(el.nextSibling.textContent);
    return bits.filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ").trim();
  }

  /** Yes/no radio groups (work authorization, sponsorship). */
  function fillRadioGroup(els, value) {
    const want = String(value).toLowerCase().trim();
    if (els.some((e) => e.checked)) return false;
    const hit = els.find((e) => {
      const t = optionText(e);
      return want === "yes" ? /\byes\b/.test(t) : /\bno\b|\bnot\b/.test(t);
    });
    if (!hit) return false;
    els.forEach((e) => e.setAttribute(MARK, "1"));
    hit.click();
    return true;
  }

  /* ---------- main ---------- */

  function fill(profile) {
    const filled = [];
    const skipped = [];

    // Resolve full_name if the profile only carries the parts.
    const p = { ...profile };
    if (!p.full_name && (p.first_name || p.last_name)) {
      p.full_name = [p.first_name, p.last_name].filter(Boolean).join(" ");
    }

    const radioGroups = new Map();

    document.querySelectorAll("input, select, textarea").forEach((el) => {
      if (el.disabled || el.readOnly) return;
      if (el.type === "hidden" || el.type === "submit" || el.type === "button") return;
      if (el.type === "password" || el.type === "file") return;
      if (!el.offsetParent && el.type !== "radio") return;   // not visible

      const ctx = contextOf(el);
      const key = keyFor(ctx);
      if (!key) return;
      const value = p[key];
      if (value === undefined || value === "") return;

      if (el.type === "radio") {
        const g = el.name || key;
        if (!radioGroups.has(g)) radioGroups.set(g, { key, els: [] });
        radioGroups.get(g).els.push(el);
        return;
      }


      let ok = false;
      if (el.tagName === "SELECT") ok = fillSelect(el, value);
      else if (el.type === "checkbox") ok = false;   // consent is the user's call
      else ok = fillText(el, value);

      if (ok) {
        el.setAttribute(MARK, "1");
        filled.push(key);
      } else if (!el.value) {
        skipped.push(key);
      }
    });

    for (const { key, els } of radioGroups.values()) {
      const value = p[key];
      if (value && fillRadioGroup(els, value)) {
        els.forEach((e) => e.setAttribute(MARK, "1"));
        filled.push(key);
      }
    }

    return { filled: [...new Set(filled)], skipped: [...new Set(skipped)] };
  }

  function countFillable() {
    let n = 0;
    document.querySelectorAll("input, select, textarea").forEach((el) => {
      if (el.disabled || el.type === "hidden" || el.type === "password") return;
      if (keyFor(contextOf(el))) n++;
    });
    return n;
  }

  /* ---------- learning ---------- */

  /* Values the user typed by hand, keyed by profile field. Collected as they
     type and flushed when the page is left, so a filled-in application
     teaches the profile without anyone maintaining it.

     Safety: this reuses keyFor(), so every field NEVER_FILL rejects --
     passwords, government IDs, payment details, free-text essays -- is
     invisible to learning exactly as it is to filling. */

  const observed = new Map();
  // Keys whose value the user changed after we had autofilled them. These
  // are allowed to replace a stored answer; a plain observation is not.
  const corrected = new Set();

  /** True when this value came from the user rather than from our own fill. */
  function isHandEntered(el) {
    return !el.hasAttribute(MARK);
  }

  function observe(el) {
    if (!isHandEntered(el)) return;
    if (el.type === "password" || el.type === "file" || el.type === "hidden") return;

    const key = keyFor(contextOf(el));
    if (!key) return;

    let value = "";
    if (el.type === "radio" || el.type === "checkbox") {
      if (!el.checked) return;
      value = optionText(el).replace(/\s+/g, " ").trim();
      // Reduce a yes/no answer to the token the profile stores.
      if (BOOLEAN_KEYS.has(key)) value = /\byes\b/.test(value) ? "Yes" : "No";
    } else if (el.tagName === "SELECT") {
      const opt = el.options[el.selectedIndex];
      if (!opt || !opt.value) return;
      value = opt.text.trim();
    } else {
      value = (el.value || "").trim();
    }

    if (!value || value.length > 200) return;
    observed.set(key, value);
  }

  /* A keystroke in a field we filled means the user is correcting us: drop
     the mark so the corrected value is learned like any hand-entered one. */
  document.addEventListener("keydown", (e) => {
    const el = e.target;
    if (el && el.hasAttribute && el.hasAttribute(MARK) && !e.metaKey && !e.ctrlKey) {
      el.removeAttribute(MARK);
      const key = keyFor(contextOf(el));
      if (key) corrected.add(key);
    }
  }, true);

  document.addEventListener("change", (e) => observe(e.target), true);
  document.addEventListener("blur", (e) => observe(e.target), true);

  function flush() {
    if (!observed.size) return;
    const values = Object.fromEntries(observed);
    const corrections = [...corrected].filter((k) => k in values);
    observed.clear();
    corrected.clear();
    try {
      chrome.runtime.sendMessage({
        type: "JOBAGENT_LEARN", values, corrected: corrections,
      });
    } catch { /* the extension context is gone; nothing to do */ }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg.type === "JOBAGENT_FILL") {
      try {
        respond({ ok: true, ...fill(msg.profile) });
      } catch (e) {
        respond({ ok: false, error: String(e) });
      }
    } else if (msg.type === "JOBAGENT_PROBE") {
      respond({
        ok: true,
        fillable: countFillable(),
        host: location.host,
        pending: Object.fromEntries(observed),
      });
    } else if (msg.type === "JOBAGENT_FLUSH") {
      const values = Object.fromEntries(observed);
      const corrections = [...corrected].filter((k) => k in values);
      observed.clear();
      corrected.clear();
      respond({ ok: true, values, corrected: corrections });
    }
    return true;   // keep the channel open for the async response
  });
})();
