// LeetCode sync: public GraphQL data only. No password, no session cookie.
//
// What LeetCode's public API actually allows (verified live, Oct 2026):
// - Solved COUNTS per user: yes (matchedUser submitStats).
// - Recent Accepted submissions: yes, but capped at the latest 20.
// - Difficulty + topic tags for any problem: yes (problemsetQuestionListV2).
// - The FULL solved-history list: NOT available without the user's login
//   session. So this app (a) imports the latest 20 on every sync and keeps
//   accumulating new solves from then on, and (b) supports a one-time
//   backfill where the user pastes their solved problem names/slugs and we
//   enrich them. The limitation is LeetCode's, and the README says so.

const fs = require("fs");
const path = require("path");
const { mapTagsToPattern } = require("./patterns");

const GQL = "https://leetcode.com/graphql";
const META_CACHE = path.join(__dirname, "meta-cache-v2.json");
const META_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://leetcode.com",
      "User-Agent": "dsa-revision-tracker/2.0"
    },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) throw new Error(`LeetCode GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error("LeetCode GraphQL error: " + JSON.stringify(json.errors).slice(0, 200));
  return json.data;
}

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// Solved counts: { total, Easy, Medium, Hard } — null if user not found.
async function getSolvedStats(username) {
  const data = await gql(
    `query($u:String!){ matchedUser(username:$u){ submitStats{ acSubmissionNum{ difficulty count } } } }`,
    { u: username }
  );
  if (!data.matchedUser) return null;
  const stats = { total: 0, Easy: 0, Medium: 0, Hard: 0 };
  for (const row of data.matchedUser.submitStats.acSubmissionNum) {
    if (row.difficulty === "All") stats.total = row.count;
    else stats[row.difficulty] = row.count;
  }
  return stats;
}

// Latest Accepted submissions (LeetCode caps this list at 20).
async function getRecentSolved(username) {
  const data = await gql(
    `query($u:String!,$l:Int!){ recentAcSubmissionList(username:$u, limit:$l){ title titleSlug timestamp } }`,
    { u: username, l: 100 }
  );
  const bySlug = new Map();
  for (const r of data.recentAcSubmissionList || []) {
    if (!bySlug.has(r.titleSlug)) bySlug.set(r.titleSlug, { title: r.title, slug: r.titleSlug });
  }
  return [...bySlug.values()];
}

// Difficulty + tags for the whole catalogue, cached to disk for a week.
async function getQuestionMeta() {
  try {
    const cached = JSON.parse(fs.readFileSync(META_CACHE, "utf8"));
    if (Date.now() - cached.savedAt < META_TTL_MS) return new Map(cached.entries);
  } catch { /* no cache yet */ }

  const query = `
    query($limit:Int!,$skip:Int!){
      problemsetQuestionListV2(categorySlug:"", limit:$limit, skip:$skip){
        totalLength
        questions{ title titleSlug difficulty topicTags{ name } }
      }
    }`;
  const meta = new Map();
  const PAGE = 100;
  let total = Infinity;
  for (let skip = 0; skip < total; skip += PAGE) {
    const data = await gql(query, { limit: PAGE, skip });
    total = data.problemsetQuestionListV2.totalLength;
    for (const q of data.problemsetQuestionListV2.questions) {
      meta.set(q.titleSlug, {
        title: q.title,
        difficulty: titleCase(q.difficulty),
        tags: (q.topicTags || []).map((t) => t.name)
      });
    }
  }
  fs.writeFileSync(META_CACHE, JSON.stringify({ savedAt: Date.now(), entries: [...meta] }));
  return meta;
}

// Attach difficulty/tags/pattern/link to a list of {slug, title}.
async function enrich(list, meta) {
  return list.map((p) => {
    const m = meta.get(p.slug) || { difficulty: "Medium", tags: [] };
    return {
      slug: p.slug,
      title: p.title,
      difficulty: m.difficulty,
      topics: m.tags,
      pattern: mapTagsToPattern(m.tags),
      link: `https://leetcode.com/problems/${p.slug}/`
    };
  });
}

// Main sync: stats + enriched recent solves.
async function syncUser(username) {
  const stats = await getSolvedStats(username);
  if (!stats) throw new Error(`LeetCode user "${username}" not found`);
  const [recent, meta] = await Promise.all([getRecentSolved(username), getQuestionMeta()]);
  return { username, stats, problems: await enrich(recent, meta) };
}

// Backfill helper: enrich an arbitrary list of slugs the user pastes in.
async function enrichSlugs(slugs) {
  const meta = await getQuestionMeta();
  const list = slugs.map((slug) => {
    const m = meta.get(slug);
    return { slug, title: m?.title || slug };
  });
  return enrich(list, meta);
}

module.exports = { syncUser, getSolvedStats, getRecentSolved, enrichSlugs };

if (require.main === module) {
  const username = process.argv[2];
  if (!username) { console.error("Usage: node leetcode.js <leetcode-username>"); process.exit(1); }
  syncUser(username)
    .then(({ stats, problems }) => {
      console.log(`Solved counts (LeetCode): total ${stats.total} | Easy ${stats.Easy} | Medium ${stats.Medium} | Hard ${stats.Hard}`);
      console.log(`Recent-AC import: ${problems.length} problems enriched`);
      const byPattern = {};
      for (const p of problems) byPattern[p.pattern] = (byPattern[p.pattern] || 0) + 1;
      console.log("Recent by pattern:", byPattern);
      console.log("Sample:", problems.slice(0, 3));
    })
    .catch((e) => { console.error("SYNC FAILED:", e.message); process.exit(1); });
}
