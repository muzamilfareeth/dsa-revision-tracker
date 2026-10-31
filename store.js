// Storage layer with two backends behind one interface:
// - Cloud mode (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set): Supabase
//   Postgres, multi-user. The server verifies the user's JWT itself and
//   always filters by user_id, so the service role key is safe here.
// - Local mode (no env): SQLite file, single demo user "local".
//   This keeps the app runnable with zero setup for development/demo.
//
// Interface: getProfile, setLeetcodeUsername, upsertProblems,
// listProblems, updateProblem, stats.

function makeLocalStore() {
  const Database = require("better-sqlite3");
  const path = require("path");
  const db = new Database(path.join(__dirname, "data-v2.db"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY,
      leetcode_username TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS problems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      difficulty TEXT DEFAULT 'Medium',
      topics TEXT DEFAULT '[]',
      pattern TEXT DEFAULT 'Other',
      status TEXT DEFAULT 'Solved',
      link TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      approach_note TEXT DEFAULT '',
      approach_steps TEXT DEFAULT '',
      complexity TEXT DEFAULT '',
      diagram_mermaid TEXT DEFAULT '',
      code_language TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, slug)
    );
  `);
  const parse = (r) => r && { ...r, topics: JSON.parse(r.topics || "[]") };
  return {
    async getProfile(userId) {
      return db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(userId) || { user_id: userId, leetcode_username: "" };
    },
    async setLeetcodeUsername(userId, username) {
      db.prepare("INSERT INTO profiles (user_id, leetcode_username) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET leetcode_username = excluded.leetcode_username").run(userId, username);
    },
    async upsertProblems(userId, problems) {
      const stmt = db.prepare(`
        INSERT INTO problems (user_id, slug, title, difficulty, topics, pattern, link)
        VALUES (@user_id, @slug, @title, @difficulty, @topics, @pattern, @link)
        ON CONFLICT(user_id, slug) DO UPDATE SET title=excluded.title, difficulty=excluded.difficulty,
          topics=excluded.topics, pattern=excluded.pattern, link=excluded.link, updated_at=datetime('now')`);
      let n = 0;
      for (const p of problems) {
        stmt.run({ user_id: userId, slug: p.slug, title: p.title, difficulty: p.difficulty, topics: JSON.stringify(p.topics), pattern: p.pattern, link: p.link });
        n++;
      }
      return n;
    },
    async listProblems(userId, { status, pattern, q } = {}) {
      let sql = "SELECT * FROM problems WHERE user_id = ?";
      const params = [userId];
      if (status) { sql += " AND status = ?"; params.push(status); }
      if (pattern) { sql += " AND pattern = ?"; params.push(pattern); }
      if (q) { sql += " AND title LIKE ?"; params.push(`%${q}%`); }
      sql += " ORDER BY updated_at DESC";
      return db.prepare(sql).all(...params).map(parse);
    },
    async updateProblem(userId, slug, fields) {
      const allowed = ["status", "notes", "approach_note", "approach_steps", "complexity", "diagram_mermaid", "code_language"];
      const sets = [], params = [];
      for (const k of allowed) if (fields[k] !== undefined) { sets.push(`${k} = ?`); params.push(fields[k]); }
      if (!sets.length) return null;
      sets.push("updated_at = datetime('now')");
      db.prepare(`UPDATE problems SET ${sets.join(", ")} WHERE user_id = ? AND slug = ?`).run(...params, userId, slug);
      return parse(db.prepare("SELECT * FROM problems WHERE user_id = ? AND slug = ?").get(userId, slug));
    },
    async stats(userId) {
      const rows = db.prepare("SELECT status, COUNT(*) AS n FROM problems WHERE user_id = ? GROUP BY status").all(userId);
      const out = { total: 0, Solved: 0, Partial: 0, Forgotten: 0 };
      for (const r of rows) { out[r.status] = r.n; out.total += r.n; }
      return out;
    }
  };
}

function makeSupabaseStore() {
  const { createClient } = require("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    async getProfile(userId) {
      const { data } = await sb.from("profiles").select("*").eq("id", userId).single();
      return data || { id: userId, leetcode_username: "" };
    },
    async setLeetcodeUsername(userId, username) {
      await sb.from("profiles").upsert({ id: userId, leetcode_username: username });
    },
    async upsertProblems(userId, problems) {
      const rows = problems.map((p) => ({
        user_id: userId, slug: p.slug, title: p.title, difficulty: p.difficulty,
        topics: p.topics, pattern: p.pattern, link: p.link
      }));
      const { error } = await sb.from("problems").upsert(rows, { onConflict: "user_id,slug" });
      if (error) throw new Error("Supabase upsert failed: " + error.message);
      return rows.length;
    },
    async listProblems(userId, { status, pattern, q } = {}) {
      let query = sb.from("problems").select("*").eq("user_id", userId).order("updated_at", { ascending: false });
      if (status) query = query.eq("status", status);
      if (pattern) query = query.eq("pattern", pattern);
      if (q) query = query.ilike("title", `%${q}%`);
      const { data, error } = await query;
      if (error) throw new Error("Supabase list failed: " + error.message);
      return data;
    },
    async updateProblem(userId, slug, fields) {
      const allowed = ["status", "notes", "approach_note", "approach_steps", "complexity", "diagram_mermaid", "code_language"];
      const patch = { updated_at: new Date().toISOString() };
      for (const k of allowed) if (fields[k] !== undefined) patch[k] = fields[k];
      const { data, error } = await sb.from("problems").update(patch).eq("user_id", userId).eq("slug", slug).select().single();
      if (error) throw new Error("Supabase update failed: " + error.message);
      return data;
    },
    async stats(userId) {
      const { data, error } = await sb.from("problems").select("status").eq("user_id", userId);
      if (error) throw new Error("Supabase stats failed: " + error.message);
      const out = { total: 0, Solved: 0, Partial: 0, Forgotten: 0 };
      for (const r of data) { out[r.status]++; out.total++; }
      return out;
    }
  };
}

const cloud = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
module.exports = {
  store: cloud ? makeSupabaseStore() : makeLocalStore(),
  cloud
};
