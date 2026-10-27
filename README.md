# LexiAI — Advanced Learner Dictionary

An AI-powered vocabulary workbench for advanced English learners. Look up words with finance-aware definitions, collect them in a notebook with real-world reading contexts, then actually *master* them through spaced repetition, writing practice, **speaking practice**, and AI-generated podcasts — all wrapped in a daily-quest & streak system.

**Bring your own keys, own your own data.** Every user runs LexiAI with their own Claude API key (plus an optional free Gemini key for voice) and (optionally) their own free Supabase project. No middleman server, no usage fees.

## Features

| | |
|---|---|
| 📖 **Dictionary** | Precision lookups with IPA, finance/business senses highlighted, synonym comparison, sentence breakdown |
| 🗂️ **Notebook** | Save words with definitions, collocations and *your own reading contexts* — paste the paragraph where you met the word and ask the embedded AI what it means right there |
| 🔁 **Flashcards** | SM-2 spaced repetition (rate each card Forgot / Fuzzy / Got It / Easy), plus a 60-second synonym match game |
| ✍️ **Practice** | Write a sentence with a target word; AI scores it and suggests more idiomatic alternatives |
| 🗣️ **Speaking Studio** | Shadowing (listen & repeat with word-level diff), Recall (say the word from its definition), Speak-a-Sentence (spoken practice with AI feedback) |
| 🎙️ **Podcast** | Pick 2–5 words from your notebook and generate a two-host dialogue that uses them naturally, with audio |
| 🎯 **Gamification** | Word mastery ladder (Collected → Reviewing → Can Write → Can Speak), daily quests, XP levels, streaks, achievements |
| ☁️ **Sync** | Guest mode stores everything in the browser; sign in (Supabase) to sync across devices. JSON export/import anytime |
| 📱 **PWA** | Install to your phone's home screen; notebook and flashcards work offline |

## Quick Start

```bash
git clone https://github.com/<you>/lexiai.git
cd lexiai
npm install
cp .env.example .env.local   # then fill in your keys (see below)
npm run dev
```

### 1. API keys

- **Claude API key (required for AI features)** — get one at [console.anthropic.com](https://console.anthropic.com/settings/keys). Powers lookups, feedback, chat and analysis. Default model: Claude Opus 5.5 (switchable to Sonnet 5.5 / Haiku 5.5 in Settings).
- **Gemini API key (optional, voice only)** — free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Used for speech transcription, natural-sounding read-aloud and podcast audio; without it the browser's own voice features are used.

Put them in `.env.local` as `ANTHROPIC_API_KEY=...` and `API_KEY=...`, **or** paste them in the app under **Settings (gear icon)** — stored only in your browser and never uploaded.

### 2. Supabase (optional — for accounts & cross-device sync)

Skip this if browser-local storage is enough for you; the app works fully as a guest.

1. Create a free project at [supabase.com](https://supabase.com)
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it
3. Copy your **Project URL** and **Publishable key** (Project Settings → API Keys) into `.env.local`:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=sb_publishable_...
```

Data is protected by Postgres Row Level Security — each account can only read and write its own rows. The publishable key is designed to be public.

## Deploy

Any static host works. For Vercel:

```bash
npm i -g vercel
vercel --prod
```

Set `API_KEY` (optional), `SUPABASE_URL` and `SUPABASE_KEY` as environment variables in your Vercel project settings, or leave `API_KEY` unset and let each visitor bring their own key via Settings. After deploying, open the site on your phone and "Add to Home Screen" to install the PWA.

## Tech Stack

React 18 + TypeScript + Vite · Tailwind CSS · Claude API (`@anthropic-ai/sdk`) · Gemini API for audio (`@google/genai`) · Supabase (auth + Postgres with RLS) · vite-plugin-pwa

## License

[MIT](LICENSE)
