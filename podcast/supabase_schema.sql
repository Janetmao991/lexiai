-- "Heard in podcasts" corpus: sentences transcribed locally (podcast/ingest.py) and
-- uploaded by podcast/sync_supabase.py. Audio is never stored — clips play from the
-- publisher's enclosure URL. Kept lean for the Free plan's 500 MB: integer ids,
-- real timestamps, and an expression index instead of a stored tsvector column.

create table if not exists public.podcast_episodes (
  id integer primary key,              -- same id as the local corpus.db
  show text not null,
  kind text not null,                  -- 'everyday' | 'work'
  title text not null,
  published text,
  audio_url text not null,
  link text
);

create table if not exists public.podcast_sentences (
  id integer generated always as identity primary key,
  episode_id integer not null references public.podcast_episodes(id) on delete cascade,
  start_s real not null,
  end_s real not null,
  text text not null
);

create index if not exists podcast_sentences_fts
  on public.podcast_sentences using gin (to_tsvector('english', text));

-- Transcripts of other people's shows: readable by signed-in users only, never anon.
alter table public.podcast_episodes enable row level security;
alter table public.podcast_sentences enable row level security;

drop policy if exists "signed-in read" on public.podcast_episodes;
create policy "signed-in read" on public.podcast_episodes for select to authenticated using (true);
drop policy if exists "signed-in read" on public.podcast_sentences;
create policy "signed-in read" on public.podcast_sentences for select to authenticated using (true);

-- Candidate clips for a word or phrase. Postgres stemming is loose (integral ~ integrity),
-- so the app re-filters these with an inflection-only match before showing them.
create or replace function public.search_podcast_clips(term text, max_rows integer default 80)
returns table (
  text text, start_s real, end_s real,
  show text, kind text, title text, published text, audio_url text
)
language sql stable security invoker
set search_path = public
as $$
  select s.text, s.start_s, s.end_s, e.show, e.kind, e.title, e.published, e.audio_url
  from public.podcast_sentences s
  join public.podcast_episodes e on e.id = s.episode_id
  where to_tsvector('english', s.text) @@ phraseto_tsquery('english', term)
  order by (e.kind = 'everyday') desc, length(s.text)
  limit least(max_rows, 200);
$$;

revoke all on function public.search_podcast_clips(text, integer) from public, anon;
grant execute on function public.search_podcast_clips(text, integer) to authenticated;
