// DSA Revision Tracker v2 - frontend
const $ = (id) => document.getElementById(id);
let cfg = null, sb = null, session = null, reviseMode = false, currentNoteSlug = null;

mermaid.initialize({ startOnLoad: false, theme: "dark" });

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (session) headers.Authorization = "Bearer " + session.access_token;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function init() {
  cfg = await (await fetch("/api/config")).json();
  if (cfg.cloud) {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const { data } = await sb.auth.getSession();
    session = data.session;
    sb.auth.onAuthStateChange((_e, s) => { session = s; renderAuthState(); if (s) loadAll(); });
  }
  renderAuthState();
  if (!cfg.cloud || session) loadAll();
}

function renderAuthState() {
  const loggedIn = !cfg.cloud || Boolean(session);
  $("auth-card").hidden = loggedIn;
  $("app").hidden = !loggedIn;
  $("logout-btn").hidden = !cfg.cloud;
}

$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: $("a-email").value, password: $("a-password").value });
  $("auth-msg").textContent = error ? error.message : "";
});
$("signup-btn").addEventListener("click", async () => {
  const { error } = await sb.auth.signUp({ email: $("a-email").value, password: $("a-password").value });
  $("auth-msg").textContent = error ? error.message : "Account created. Check your email if confirmation is on, then sign in.";
});
$("logout-btn").addEventListener("click", async () => { if (sb) await sb.auth.signOut(); });

async function loadAll() {
  await loadStats();
  await loadList();
}

async function loadStats() {
  const s = await api("/api/stats");
  $("stat-total").textContent = s.tracker.total;
  $("stat-solved").textContent = s.tracker.Solved;
  $("stat-partial").textContent = s.tracker.Partial;
  $("stat-forgotten").textContent = s.tracker.Forgotten;
  if (s.leetcode) {
    $("lc-stats").textContent = `LeetCode (${s.leetcodeUsername}): ${s.leetcode.total} solved — ${s.leetcode.Easy} Easy · ${s.leetcode.Medium} Medium · ${s.leetcode.Hard} Hard`;
    $("lc-username").value = s.leetcodeUsername || "";
  }
}

async function loadList() {
  const params = new URLSearchParams();
  if (!reviseMode) {
    if ($("filter-status").value) params.set("status", $("filter-status").value);
    if ($("filter-pattern").value) params.set("pattern", $("filter-pattern").value);
    if ($("q").value.trim()) params.set("q", $("q").value.trim());
  }
  let items = await api("/api/problems?" + params);
  if (reviseMode) items = items.filter((p) => p.status !== "Solved")
    .sort((a, b) => (a.status === "Forgotten" ? 0 : 1) - (b.status === "Forgotten" ? 0 : 1));

  // Fill pattern filter once
  const patterns = [...new Set(items.map((p) => p.pattern))].sort();
  const sel = $("filter-pattern");
  const keep = sel.value;
  if (sel.options.length <= 1) for (const p of patterns) sel.add(new Option(p, p));
  sel.value = keep;

  render(items);
}

function itemHtml(p) {
  return `
    <div>
      <h3><a href="${p.link}" target="_blank" rel="noopener">${p.title}</a></h3>
      <div class="meta">${p.pattern} · ${p.difficulty} · ${(p.topics || []).slice(0, 3).join(", ")}</div>
      ${p.approach_note ? `<p class="notes">📝 ${p.approach_note}</p>` : ""}
    </div>
    <div class="actions">
      <select class="status-select" data-slug="${p.slug}">
        ${["Solved", "Partial", "Forgotten"].map((s) => `<option ${s === p.status ? "selected" : ""}>${s}</option>`).join("")}
      </select>
      <button class="ghost" data-note="${p.slug}" data-title="${p.title.replace(/"/g, "&quot;")}">${p.approach_note ? "View / edit note" : "Add AI note"}</button>
    </div>`;
}

function render(items) {
  const list = $("list");
  list.innerHTML = "";
  $("empty").hidden = items.length > 0;
  const grouped = $("group-pattern").checked;
  const groups = new Map();
  if (grouped) {
    for (const p of items) { if (!groups.has(p.pattern)) groups.set(p.pattern, []); groups.get(p.pattern).push(p); }
  } else groups.set("", items);
  for (const [pattern, group] of groups) {
    if (pattern) {
      const h = document.createElement("h3");
      h.className = "group-title";
      h.textContent = `${pattern} (${group.length})`;
      list.appendChild(h);
    }
    for (const p of group) {
      const div = document.createElement("div");
      div.className = "item " + p.status;
      div.innerHTML = itemHtml(p);
      list.appendChild(div);
    }
  }
  list.querySelectorAll(".status-select").forEach((selEl) => {
    selEl.addEventListener("change", async () => {
      await api("/api/problems/" + selEl.dataset.slug, { method: "PUT", body: JSON.stringify({ status: selEl.value }) });
      loadStats(); loadList();
    });
  });
  list.querySelectorAll("[data-note]").forEach((btn) => {
    btn.addEventListener("click", () => openNote(btn.dataset.note, btn.dataset.title, items.find((x) => x.slug === btn.dataset.note)));
  });
}

$("connect-btn").addEventListener("click", async () => {
  $("connect-msg").textContent = "Connecting...";
  try {
    const r = await api("/api/connect", { method: "POST", body: JSON.stringify({ username: $("lc-username").value }) });
    $("connect-msg").textContent = `Imported ${r.imported} recent problems. LeetCode total: ${r.leetcode.total} solved.`;
    loadAll();
  } catch (e) { $("connect-msg").textContent = e.message; }
});
$("sync-btn").addEventListener("click", async () => {
  try {
    const r = await api("/api/sync", { method: "POST", body: "{}" });
    $("connect-msg").textContent = `Synced. ${r.imported} problems up to date.`;
    loadAll();
  } catch (e) { $("connect-msg").textContent = e.message; }
});
$("backfill-btn").addEventListener("click", async () => {
  try {
    const r = await api("/api/backfill", { method: "POST", body: JSON.stringify({ slugs: $("backfill-text").value }) });
    $("connect-msg").textContent = `Backfill imported ${r.imported} problems.`;
    loadAll();
  } catch (e) { $("connect-msg").textContent = e.message; }
});
$("revise-btn").addEventListener("click", () => {
  reviseMode = !reviseMode;
  $("revise-btn").textContent = reviseMode ? "Showing revise queue — tap to show all" : "Revise queue: Partial + Forgotten";
  loadList();
});
for (const id of ["filter-status", "filter-pattern", "group-pattern"]) $(id).addEventListener("change", () => { reviseMode = false; loadList(); });
$("q").addEventListener("input", () => { reviseMode = false; loadList(); });

// ---------- AI note modal ----------
function openNote(slug, title, problem) {
  currentNoteSlug = slug;
  $("note-title").textContent = "Approach note — " + title;
  $("note-draft").hidden = true;
  $("note-msg").textContent = "";
  $("note-saved").innerHTML = problem?.approach_note
    ? `<p><strong>Saved note:</strong> ${problem.approach_note}</p>
       <p class="muted">${problem.complexity || ""}</p>
       <pre class="muted">${(problem.approach_steps || "").split("\n").filter(Boolean).map((s) => "• " + s).join("\n")}</pre>`
    : `<p class="muted">No note saved yet. Paste your accepted code below and generate one.</p>`;
  $("note-modal").hidden = false;
}
$("note-close").addEventListener("click", () => { $("note-modal").hidden = true; });

$("note-gen").addEventListener("click", async () => {
  $("note-msg").textContent = "Generating...";
  try {
    const note = await api("/api/note/generate", {
      method: "POST",
      body: JSON.stringify({ title: $("note-title").textContent, language: $("note-lang").value, code: $("note-code").value })
    });
    $("d-explanation").value = note.explanation;
    $("d-steps").value = note.steps.join("\n");
    $("d-complexity").value = note.complexity;
    $("d-diagram").value = note.diagram;
    $("note-draft").hidden = false;
    $("note-msg").textContent = "Draft ready — edit anything, then approve.";
    renderDiagram();
  } catch (e) { $("note-msg").textContent = e.message; }
});

async function renderDiagram() {
  const code = $("d-diagram").value.trim();
  if (!code) { $("d-preview").innerHTML = ""; return; }
  try {
    const { svg } = await mermaid.render("mmd-" + Date.now(), code);
    $("d-preview").innerHTML = svg;
  } catch { $("d-preview").innerHTML = "<p class='muted'>Diagram has a syntax error — edit the Mermaid text.</p>"; }
}
$("d-diagram").addEventListener("blur", renderDiagram);

$("note-save").addEventListener("click", async () => {
  await api("/api/problems/" + currentNoteSlug, {
    method: "PUT",
    body: JSON.stringify({
      approach_note: $("d-explanation").value,
      approach_steps: $("d-steps").value,
      complexity: $("d-complexity").value,
      diagram_mermaid: $("d-diagram").value,
      code_language: $("note-lang").value
    })
  });
  $("note-modal").hidden = true;
  loadList();
});

init();
