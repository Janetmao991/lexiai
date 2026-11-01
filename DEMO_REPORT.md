# Demo mode — report

Branch `demo-mode` (worktree `~/lexiai-demo`). Committed locally; not pushed.

## What a visitor gets

- **Entry:** `https://lexiai-seven.vercel.app/?demo=1` (for the portfolio's "Try it live"), or the
  **Try the demo** button on the Sign In / Create Account form.
- **Banner** at the top: `Demo mode · Sample words, nothing leaves this tab · Sign up · Exit demo`.
  *Exit demo* goes back to the normal app with the Sign In form open; *Sign up* goes there with the
  Create Account form open.
- **Look up:** 8 fully written entries: *appall, bludgeon, mull over, stretched thin, go against the
  grain, clip, gauge, headwind*. They have senses numbered straight through (i, ii, iii…), Chinese
  translations for every sense, synonyms, examples, collocations and "easily confused" forms. Inflected
  forms also work (e.g. *appalled* or *headwinds* opens the main entry). The empty screen shows
  tappable sample words and sentences.
- **Sentence breakdowns:** 3 sentences, each with a second tappable word:
  - "Sales have been growing **at a pretty rapid clip** since the spring." → *clip* = speed. This is
    sense **iii**, set against the usual "video / paper clip" meaning. Tapping *pretty* explains it too.
    Saving files the sentence under sense iii in the definition.
  - "…the team is **stretched thin** and the launch will probably **slip** to June."
  - "Investors are still trying to **gauge** how much the stronger dollar will **weigh on** earnings."
- **Notebook:** 7 saved words (3 with saved sentences). *bludgeon* is left out on purpose so visitors
  can try **Save to Notebook**.
- **Review:** 3 cards due today plus 3 new ones, so the badge shows 6. Rating cards works, and Spelling
  and Match Game work too.
- **Podcasts:** 5 notebook words have **real lines** from indexed shows (Diary of a CEO, SmartLess, Mel
  Robbins, Armchair Expert, Acquired), with the sentence before and after and a sense tag. They are
  **text only**: our audio clips sit in a private Supabase bucket, and the publishers' own MP3s carry
  dynamic ads that shift the timestamps. So no audio plays in the demo. A footnote says so.
- **Ask Lexi:** two canned answers, shown as tappable sample questions:
  - "What's the difference between appall and shock?"
  - "表示"审慎乐观"用英文怎么说？" → *cautiously optimistic*
  
  These also match looser wording (e.g. "审慎乐观 英文怎么说"). Any other question gets the demo note
  plus the list of sample questions.
- **Compare:** one canned comparison (*appall · shock · horrify*), with a "Try a sample" link.
- **Progress pill:** a 12-day streak at level 5, so the gamification shows.
- **Not available → friendly note** ("This is a demo — sign up to …"):
  - looking up an unknown word
  - explaining an unknown sentence or tapping a word that isn't covered
  - Settings (gear icon)
  - photo or file upload in Ask Lexi
  - adding your own sentence or chatting in the Notebook
  - "Look it up as typed"

  Saving works, but only for this session, and a toast says so.
- **Persistence:** demo changes (saves, reviews, XP) live in this tab's `sessionStorage`, under keys
  prefixed `lexiai_demo:`. They survive a reload. Exiting or re-entering the demo clears them.

## How it works (plain words)

There is one switch, `IS_DEMO`, in `services/demo.ts`. It is read **once from the URL when the page
loads** (`?demo=1`). Entering or leaving the demo reloads the page. That way nothing from the other mode
(a logged-in Supabase client, an API client) can survive in memory.

With the switch on:
- **Supabase is never created** (`supabaseClient.ts` returns `null`), so there are no auth calls,
  reads or writes.
- **Claude and Gemini are hard-blocked** at the lowest level: the client factories in `claude.ts` and
  `geminiService.ts` throw before building a client. On top of that, every AI function the UI uses
  answers from the fixture first (`services/demoService.ts`), so the block is only a safety net. Voice
  falls back to the browser's own speech.
- **Storage is swapped:** the notebook and stats read and write `sessionStorage` (seeded from the
  fixture). The visitor's real IndexedDB notebook and localStorage are never opened.
- **The fixture is a separate download:** `demo/fixture.ts` loads with a dynamic import, so it becomes
  its own 20 KB chunk. Normal visitors never download it, and the Playwright run confirms this.

## Files

New:
- `services/demo.ts`: the switch, the friendly-note error type, the toast event, the session store,
  enter/exit, and the fixture loader.
- `services/demoService.ts`: fixture-backed lookup, sentence breakdowns, sense picking, compare, Ask
  Lexi and podcast lines.
- `demo/fixture.ts`: all demo content (typed against `types.ts`). SRS due dates are computed relative
  to today, so the review queue is always "due".
- `demo/demo-check.cjs`: the Playwright walkthrough used for verification (see its header for how to
  run it).

Changed:
- `index.tsx`: loads the fixture before the notebook in demo mode.
- `App.tsx`: banner, toast, *Try the demo* button on the sign-in form, `#signin`/`#signup` landing
  after exit, Settings gated, account and debug buttons hidden in demo, "saved for this session" note.
- `services/supabaseClient.ts`, `claude.ts`, `geminiService.ts`: the blocks described above.
- `services/claudeService.ts`: a demo branch at the top of each AI function the UI uses.
- `services/podcastService.ts`: demo lines, plus a `libraryAvailable()` helper that replaces the
  duplicated session check in `Podcasts.tsx` and `PodcastClips.tsx`.
- `services/localStorageService.ts`, `statsService.ts`: session storage in demo.
- `components/Dictionary.tsx`: sample chips, a friendly note box under the input, a compare sample.
- `components/AskAI.tsx`: sample-question chips; demo notes are shown as they are.
- `components/Notebook.tsx`, `PodcastClips.tsx`: show the demo note / text-only footnote.

## How it was verified

1. `npm run build` (tsc + vite) passes.
2. I ran `vite preview` on port **5191** (5180/5182/5184 were left alone, and they are still running).
   Then I ran `demo/demo-check.cjs` with Playwright in **fresh browser contexts** (service workers
   blocked), logging every request. **35/35 checks passed:**
   - `/?demo=1` shows the banner and no API-key banner.
   - Looking up *bludgeon* shows senses i–iv and the Chinese gloss. Saving shows the session toast.
   - An unknown word (*serendipity*) shows the friendly note.
   - The "at a pretty rapid clip" sentence shows the meaning, "Not the usual meaning", and the save
     lands under **sense iii**. "See it in the definition" shows the sentence under that sense.
   - Tapping *slip* in the second sentence works.
   - Notebook lists the fixture words. A Review card can be flipped and rated.
   - Podcasts shows "5 of 8 words heard", and the *gauge* lines are sense-tagged.
   - Ask Lexi gives both canned answers, and any other question gets the demo note.
   - Settings shows the demo note.
   - **Storage:** no `lexiai*` localStorage keys, no `lexiai` IndexedDB database, and demo data only
     in sessionStorage.
   - **Network:** no requests to any Supabase, Anthropic or Gemini (`generativelanguage.googleapis.com`)
     host. Hosts contacted in demo: `localhost`, `cdn.tailwindcss.com`, `fonts.googleapis.com` /
     `fonts.gstatic.com` (the web fonts in `index.html`), and `dict.youdao.com` (the existing
     pronunciation audio).
   - A reload keeps the demo save. **Exit demo** lands on `/` with the Sign In form showing *Try the
     demo*, and the demo session data is cleared. *Try the demo* re-enters.
   - **Normal mode** (new context, `/`): no banner, no sample chips, the fixture chunk is *not*
     downloaded, the account and debug buttons show, and the real IndexedDB `lexiai` notebook is used.
   - No console errors.
3. Screenshots are in `shots-demo/` (01-landing … 14-normal-mode). They are not committed.

## Limitations / things to know

- **Fonts hit `fonts.googleapis.com`.** This is the Google Fonts stylesheet already in `index.html`,
  not the Gemini API, so I left it alone (the app keeps its original fonts). If "no googleapis at all"
  is meant literally, the fonts would need to be self-hosted.
- **Security note (not caused by this change):** `vite.config.ts` bakes `ANTHROPIC_API_KEY` /
  `API_KEY` from `.env` into the JavaScript bundle. This worktree's local build contains a Claude key
  (I checked only that one is present; I did not print it). If those variables are set in **Vercel's**
  environment, the public site's JS would expose the key to anyone. Demo mode never uses it. Worth
  checking Vercel's env settings, and removing those two `define` lines if the site is meant to be
  BYOK-only.
- **Not exercised locally:** the local build has no Supabase env vars. So the Sign In modal showed its
  "Cloud sync is not configured" variant, which also has the *Try the demo* button. The real sign-in
  form variant (where the button sits under "Forgot password?") was type-checked but not seen in a
  browser.
- **Podcast audio:** text only in the demo (reason above). To add audio later, upload 1–2 clips to a
  *public* bucket and set `clipPath` plus a public URL in the fixture. `PodcastClips` would then need
  a small change to use a public URL in demo.
- Demo content is static. Words outside the fixture can't be looked up. That is by design.
- Practice / Speaking / generated-podcast views aren't in the nav today. If they come back, their AI
  calls are already blocked by the safety net and would show the demo note.
