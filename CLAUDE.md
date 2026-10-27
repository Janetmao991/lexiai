# LexiAI

AI vocabulary workbench for advanced English learners (finance-aware dictionary, notebook,
SRS flashcards, writing & speaking practice, "Heard in podcasts" real-world examples).
Owner: Janet — self-taught builder. Explain non-obvious technical choices in plain words.

## Stack
- Web app: React 18 + TypeScript + Vite + Tailwind, PWA. Entry `App.tsx`, UI in `components/`, logic in `services/`, types in `types.ts`.
- AI: Claude (`@anthropic-ai/sdk`, BYOK key in Settings) for every text feature — `services/claude.ts` (client +
  JSON-schema helpers) and `services/claudeService.ts`. Gemini stays only for audio (transcription, natural voices,
  podcast audio) in `services/geminiService.ts`.
- Data: browser localStorage for guests; Supabase (auth + Postgres RLS) for sync. Schema `supabase/schema.sql`. Edge Function `supabase/functions/muse-api` (Deno — not part of tsconfig).
- Podcast pipeline: `podcast/` (Python, runs locally, uses NO LLM tokens)
  - `ingest.py` RSS → local mlx_whisper transcription → `data/corpus.db` (SQLite FTS5)
  - `build_examples.py` picks best example lines per word → `data/examples.db`
  - `sync_examples.py` diffs and uploads to Supabase (500 MB free cap)
  - `make_clips.py` cuts MP3 clips → Supabase Storage bucket `podcast-clips` (1 GB free cap)
  - `nightly.sh` (launchd `com.janet.lexiai-podcast`, at login + 13:00), `backfill.sh`, `reindex.py`
  - Shows list: `podcast/shows.json`

## Related projects
- ~/lexispeak — speaking app sharing the same Supabase `words` table
- podcast-dig skill reuses `podcast/data/corpus.db` transcripts (don't change its schema without checking)
- ~/Desktop/Claude-cowork/writing-station — writing practice app

## Commands
- `npm run dev` (port 5173) · `npm run build` (tsc + vite — run before committing UI changes)
- Podcast: `cd podcast && .venv/bin/python build_examples.py`, `python3 sync_examples.py`

## Token-saving rules (important)
- `podcast/data/` is huge (1.5 GB: corpus.db, audio, clips, logs). NEVER read whole files there.
  For logs use `tail -n 50`; for databases query with `sqlite3` + `LIMIT`; never print transcripts in bulk.
- Don't read `node_modules/`, `dist/`, `package-lock.json`, or the `*.png` screenshots in the root.
- Batch/repetitive work (collecting episodes, processing many transcripts) goes in a script,
  not in the conversation. If a script needs an LLM, call the API once per item inside the script.
- This folder is for LexiAI code only. Startup research / deep-dives belong elsewhere.

## Conventions
- Never commit `.env*` files or `podcast/data/`.
- Keep Supabase within free-plan limits (scripts already enforce caps — don't remove them).
- Commit messages: short, plain-English, describe the user-visible change.
- At the end of a work session, update "Current status" below (3–5 lines max).

## Current status
- Recent focus: podcast clips ("Heard in podcasts") on the Define page; Look up redesign (Word/Sentence modes).
- Backfill finished (data/backfill.done). Nightly job adds 1 archive episode per everyday show.
