-- DSA Revision Tracker v2 - Supabase schema
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  leetcode_username text,
  created_at timestamptz default now()
);

create table if not exists problems (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  title text not null,
  difficulty text not null default 'Medium',
  topics text[] not null default '{}',
  pattern text not null default 'Other',
  status text not null default 'Solved' check (status in ('Solved','Partial','Forgotten')),
  link text default '',
  notes text default '',
  approach_note text default '',
  approach_steps text default '',
  complexity text default '',
  diagram_mermaid text default '',
  code_language text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, slug)
);

alter table profiles enable row level security;
alter table problems enable row level security;

-- Users can read/write only their own rows.
create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own problems" on problems
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
