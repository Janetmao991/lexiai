-- LexiAI schema: run this once in Supabase Dashboard -> SQL Editor -> New query -> Run
-- Creates the per-user word store and stats store, both locked down with Row Level Security.

create table if not exists public.words (
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, word)
);

alter table public.words enable row level security;

create policy "Users manage their own words"
  on public.words for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Holds gamification state (XP, streak, achievements) and other per-user data as one JSON blob.
create table if not exists public.user_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_stats enable row level security;

create policy "Users manage their own stats"
  on public.user_stats for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

