// DSA Revision Tracker v2 - server
// Express API. Auth: Supabase JWT in cloud mode; single local user otherwise.

const express = require("express");
const path = require("path");
const { store, cloud } = require("./store");
const { syncUser, getSolvedStats, enrichSlugs } = require("./leetcode");
const { generateNote } = require("./gemini");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public")));

let anonClient = null;
if (cloud) {
  const { createClient } = require("@supabase/supabase-js");
  anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
}

// Frontend needs to know the mode + public Supabase config (anon key is safe to expose).
app.get("/api/config", (req, res) => {
  res.json({
    cloud,
    supabaseUrl: cloud ? process.env.SUPABASE_URL : null,
    supabaseAnonKey: cloud ? process.env.SUPABASE_ANON_KEY : null
  });
});

async function auth(req, res, next) {
  if (!cloud) { req.userId = "local"; return next(); }
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Login required" });
  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Invalid session" });
  req.userId = data.user.id;
  next();
}

// Connect a LeetCode username and import the latest solved problems.
app.post("/api/connect", auth, async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    if (!username) return res.status(400).json({ error: "LeetCode username is required" });
    const { stats, problems } = await syncUser(username);
    await store.setLeetcodeUsername(req.userId, username);
    const imported = await store.upsertProblems(req.userId, problems);
    res.json({ ok: true, leetcode: stats, imported });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Re-sync for the already-connected username.
app.post("/api/sync", auth, async (req, res) => {
  try {
    const profile = await store.getProfile(req.userId);
    const username = profile.leetcode_username;
    if (!username) return res.status(400).json({ error: "Connect LeetCode first" });
    const { stats, problems } = await syncUser(username);
    const imported = await store.upsertProblems(req.userId, problems);
    res.json({ ok: true, leetcode: stats, imported });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// One-time backfill: user pastes slugs (one per line or comma separated).
app.post("/api/backfill", auth, async (req, res) => {
  try {
    const raw = String(req.body.slugs || "");
    const slugs = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!slugs.length) return res.status(400).json({ error: "Paste at least one problem slug" });
    const problems = await enrichSlugs(slugs);
    const imported = await store.upsertProblems(req.userId, problems);
    res.json({ ok: true, imported });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/problems", auth, async (req, res) => {
  try {
    const { status, pattern, q } = req.query;
    res.json(await store.listProblems(req.userId, { status, pattern, q }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/stats", auth, async (req, res) => {
  try {
    const tracker = await store.stats(req.userId);
    const profile = await store.getProfile(req.userId);
    let leetcode = null;
    if (profile.leetcode_username) {
      leetcode = await getSolvedStats(profile.leetcode_username).catch(() => null);
    }
    res.json({ tracker, leetcode, leetcodeUsername: profile.leetcode_username || "" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/problems/:slug", auth, async (req, res) => {
  try {
    const updated = await store.updateProblem(req.userId, req.params.slug, req.body);
    if (!updated) return res.status(404).json({ error: "Problem not found" });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Generate an AI note draft from pasted code. NOT saved until the user
// approves it via PUT /api/problems/:slug with the note fields.
const noteRate = new Map(); // userId -> [timestamps]
app.post("/api/note/generate", auth, async (req, res) => {
  try {
    const now = Date.now();
    const hits = (noteRate.get(req.userId) || []).filter((t) => now - t < 24 * 60 * 60 * 1000);
    if (hits.length >= 20) return res.status(429).json({ error: "Daily AI note limit reached (20/day)" });
    const { title, language, code } = req.body;
    if (!code || !String(code).trim()) return res.status(400).json({ error: "Paste your code first" });
    const note = await generateNote({ title, language, code }, process.env.GEMINI_API_KEY);
    hits.push(now); noteRate.set(req.userId, hits);
    res.json(note);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`DSA Revision Tracker v2 running at http://localhost:${PORT} (${cloud ? "cloud/Supabase" : "local/SQLite"} mode)`);
});
