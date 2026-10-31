# DSA Revision Tracker v2

Solving is not the problem. **Remembering** is. I solved 112 problems on
LeetCode and weeks later many were gone. This app turns a LeetCode account
into a revision system.

## What it does

1. **Connect LeetCode** with just your username (no password, ever). The app
   pulls your solved counts and your latest Accepted problems through
   LeetCode's public GraphQL API, with difficulty and topic tags.
2. **Pattern-wise organisation:** problems are grouped by pattern (Sliding
   Window, Two Pointers, Monotonic Stack, Binary Search, Tree DFS...) using a
   tag-to-pattern mapping layer, the way pattern-based DSA sheets organise
   them — not as one flat solved list.
3. **AI approach notes:** paste your own accepted code and Gemini writes a
   revision note from it: a simple explanation, step-by-step approach,
   complexity, and a Mermaid flow diagram. Nothing is stored until you edit
   and approve it.
4. **Revision engine:** every problem is Solved, Partial or Forgotten. The
   revise queue shows only what is fading, Forgotten first.

## Honest limitation (LeetCode's, not ours)

LeetCode's public API exposes only your **latest 20** Accepted submissions
without a login session, and we refuse to store anyone's LeetCode session or
password. So: every sync adds your newest solves (the tracker grows with
you), and a **one-time backfill** (paste problem slugs) imports older ones.

## Stack

Node.js + Express · Supabase (Postgres + Auth) for multi-user cloud mode ·
SQLite fallback for local mode · Gemini API (free tier) · Mermaid diagrams ·
vanilla JS frontend. Deployed on Render free tier.

## Run locally

```bash
npm install
npm start        # local mode, SQLite, no accounts needed
```

Open http://localhost:3000, enter a LeetCode username, connect.

## Cloud / multi-user setup

1. Create a Supabase project, open SQL Editor, run `schema.sql`.
2. Set env vars (see `render.yaml`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` (free from Google AI Studio).
3. Deploy on Render (Blueprint from `render.yaml`, or Web Service:
   build `npm install`, start `node server.js`).

## Design decisions worth asking me about

- **Paste-code instead of auto-fetching code from LeetCode:** auto-fetch
  needs the user's session credential. Storing other people's sessions in a
  student project's database is a security and trust risk, and it breaks
  when LeetCode changes internals. One paste buys safety, user control, and
  an edit step where the user actually reads the note.
- **Two storage backends behind one interface:** SQLite keeps local dev at
  zero setup; Supabase gives multi-user Postgres + Auth in production. The
  API never knows which one is underneath.
- **AI notes are drafts, never auto-saved:** the human approves. AI output
  can be confidently wrong; the approval step is the product, not a formality.
