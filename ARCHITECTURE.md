# ARCHITECTURE — DSA Revision Tracker v2

A study guide for the owner: what every file does, and how the two main
flows move through the system.

## Big picture

```
Browser (public/)  ──HTTP/JSON──►  Express server (server.js)
                                      │
              ┌───────────────────────┼────────────────────────┐
              ▼                       ▼                        ▼
        store.js                leetcode.js               gemini.js
   (SQLite or Supabase)     (LeetCode GraphQL)        (Gemini API)
```

The frontend never talks to LeetCode, Supabase or Gemini directly for data.
Everything goes through the server, so API keys stay server-side.

## Files

| File | Job |
| --- | --- |
| `server.js` | Express app: routes, auth check, rate limit for AI notes. |
| `store.js` | Storage interface with two backends (see below). |
| `leetcode.js` | LeetCode sync: solved counts, recent Accepted list, catalogue metadata cache. |
| `patterns.js` | Tag → pattern rules (the mapping layer). |
| `gemini.js` | Builds the note prompt, calls Gemini, parses strict JSON back. |
| `schema.sql` | Supabase tables (`profiles`, `problems`) + row-level security. |
| `public/index.html` | Page structure: auth card, connect card, problem list, note modal. |
| `public/app.js` | All frontend logic: login, connect, filters, revise queue, note modal, Mermaid rendering. |
| `public/style.css` | Dark theme. Status colours: green Solved, yellow Partial, red Forgotten. |
| `render.yaml` | Render deploy config + the 4 env vars the app needs. |

## Flow 1: Connect + sync

1. User types a LeetCode username, clicks Connect.
2. `POST /api/connect` → `syncUser(username)` in `leetcode.js`:
   - `matchedUser` GraphQL query → solved counts (e.g. 112 = 44E/62M/6H).
   - `recentAcSubmissionList` → latest Accepted submissions (LeetCode caps
     this at 20 — a platform limit, not a bug).
   - `problemsetQuestionListV2` pages → difficulty + tags for the whole
     catalogue, cached in `meta-cache-v2.json` for 7 days (4096 problems;
     without the cache every sync would re-download the catalogue).
3. Each problem's tags run through `patterns.js` → one pattern per problem.
4. `store.upsertProblems` inserts new problems / refreshes metadata.
   Existing rows keep their status and notes — a re-sync never wipes the
   user's revision state. That "upsert, don't overwrite" choice is deliberate.

## Flow 2: AI approach note

1. User opens a problem, pastes their own accepted code, clicks Generate.
2. `POST /api/note/generate` (rate-limited to 20/day per user to protect
   the free Gemini quota) → `gemini.js` sends code + problem title with a
   prompt that demands strict JSON: explanation, steps, complexity, and a
   Mermaid `flowchart TD` diagram.
3. The draft appears in editable fields; Mermaid renders a live preview.
4. Only when the user clicks **Approve + save** does `PUT /api/problems/:slug`
   store the note. AI output is a draft by design — it can be confidently
   wrong, and the human check is part of the product.

## Storage: one interface, two backends

`store.js` exports the same methods either way:

- **Local mode** (no env vars): SQLite file via better-sqlite3, one demo
  user `local`. Zero setup — used for development and demos.
- **Cloud mode** (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set):
  Supabase Postgres. The server verifies the user's Supabase JWT itself
  (`anonClient.auth.getUser`) and filters every query by `user_id`, so the
  service-role key (which bypasses row-level security) is never exposed and
  never trusts client-supplied user ids. RLS policies in `schema.sql` are a
  second layer, not the only layer.

## Data model (problems table)

One row per (user, problem): `slug, title, difficulty, topics[], pattern,
status, link` from LeetCode; `notes` typed by the user; `approach_note,
approach_steps, complexity, diagram_mermaid, code_language` from the
approved AI note. `unique(user_id, slug)` is what makes upserts safe.

## Known limits

- Full solved-history is not available from LeetCode's public API (see
  README). Rolling sync + slug backfill is the workaround.
- Pattern mapping is heuristic: first matching rule wins. A problem tagged
  Array + Dynamic Programming maps to Dynamic Programming even when a human
  would call it something else. Improving this mapping (curated overrides
  for famous problems) is the natural v3.
- Gemini free tier has request limits; the 20/day per-user cap keeps one
  user from burning the whole quota.
