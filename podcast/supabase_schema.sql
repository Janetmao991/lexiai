-- "Heard in podcasts": a curated library of a few real podcast lines per word, built
-- locally by podcast/build_examples.py and uploaded by podcast/sync_examples.py.
-- Lookup is an exact match on the word's base form, so there is no full-text index and
-- the library stops growing once words reach their cap — it stays a few MB on the Free plan.
-- Audio is never stored; clips play from the publisher's enclosure URL.

create table if not exists public.podcast_episodes (
  id integer primary key,              -- same id as the local corpus.db
  show text not null,
  kind text not null,                  -- 'everyday' | 'work'
  title text not null,
  published text,
  audio_url text not null,
  link text
);

create table if not exists public.podcast_lines (
  id integer primary key,              -- sentence id in the local corpus.db
  episode_id integer not null references public.podcast_episodes(id) on delete cascade,
  start_s real not null,
  end_s real not null,
  text text not null
);

create table if not exists public.podcast_examples (
  lemma text not null,                 -- base form ("gauge") or a notebook phrase ("crop up")
  line_id integer not null references public.podcast_lines(id) on delete cascade,
  rank smallint not null,
  primary key (lemma, line_id)
);

-- Superseded full-text version.
drop function if exists public.search_podcast_clips(text, integer);
drop table if exists public.podcast_sentences;

-- Transcripts of other people's shows: readable by signed-in users only, never anon.
alter table public.podcast_episodes enable row level security;
alter table public.podcast_lines enable row level security;
alter table public.podcast_examples enable row level security;

drop policy if exists "signed-in read" on public.podcast_episodes;
create policy "signed-in read" on public.podcast_episodes for select to authenticated using (true);
drop policy if exists "signed-in read" on public.podcast_lines;
create policy "signed-in read" on public.podcast_lines for select to authenticated using (true);
drop policy if exists "signed-in read" on public.podcast_examples;
create policy "signed-in read" on public.podcast_examples for select to authenticated using (true);

create or replace function public.podcast_examples_for(term text)
returns table (
  text text, start_s real, end_s real, rank smallint,
  show text, kind text, title text, published text, audio_url text
)
language sql stable security invoker
set search_path = public
as $$
  select l.text, l.start_s, l.end_s, x.rank, e.show, e.kind, e.title, e.published, e.audio_url
  from public.podcast_examples x
  join public.podcast_lines l on l.id = x.line_id
  join public.podcast_episodes e on e.id = l.episode_id
  where x.lemma = lower(trim(term))
  order by x.rank
  limit 12;
$$;

revoke all on function public.podcast_examples_for(text) from public, anon;
grant execute on function public.podcast_examples_for(text) to authenticated;
