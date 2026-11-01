// Demo-mode walkthrough: fresh browser context, logs every request, screenshots each step.
// Playwright isn't a project dependency — run it from a scratch folder that has it:
//   npm run build && npx vite preview --port 5191 --strictPort
//   (in a scratch dir) npm i playwright && node /path/to/demo/demo-check.cjs /path/to/shots-demo
// BASE=http://host:port overrides the preview URL.
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:5191';
const OUT = process.argv[2];
const FORBIDDEN = /supabase|anthropic|googleapis/i;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const requests = [];
  page.on('request', r => requests.push(r.url()));
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const results = [];
  const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
  const shot = async (n) => { await page.waitForTimeout(900); await page.screenshot({ path: path.join(OUT, n), fullPage: false }); };
  const visible = async (locator, timeout = 5000) => { try { await locator.first().waitFor({ state: 'visible', timeout }); return true; } catch { return false; } };

  // 1. Landing
  await page.goto(`${BASE}/?demo=1`);
  check('demo banner shown', await visible(page.getByText('Demo mode', { exact: true })));
  check('no API-key banner', !(await page.getByText('AI features need a Claude API key').isVisible()));
  await shot('01-landing.png');

  // 2. Look up a fixture word that is NOT in the notebook
  await page.getByRole('button', { name: 'bludgeon', exact: true }).click();
  check('lookup: headword', await visible(page.locator('h1', { hasText: 'bludgeon' })));
  check('lookup: numbered senses i–iv', await visible(page.getByText('iv.', { exact: true })));
  check('lookup: translation gloss', await visible(page.getByText('强迫；硬逼（某人做某事）')));
  await shot('02-lookup-bludgeon.png');

  // 3. Save it (session only) → toast
  await page.getByRole('button', { name: 'Save to Notebook' }).click();
  check('save: demo toast', await visible(page.getByText('Saved for this demo session only')));
  await shot('03-saved-toast.png');

  // 4. Un-cached word → friendly note
  await page.locator('#lx-q').fill('serendipity');
  await page.locator('#lx-q').press('Enter');
  check('unknown word: friendly note', await visible(page.getByText('This is a demo — sign up to look up your own words.', { exact: false })));
  await shot('04-unknown-word.png');

  // 5. Sentence breakdown: "at a pretty rapid clip"
  await page.getByRole('tab', { name: /Sentence/ }).click();
  await page.getByRole('button', { name: /at a pretty rapid clip/ }).first().click();
  check('sentence: meaning here', await visible(page.getByText('A rate or speed, especially a fast one', { exact: false })));
  check('sentence: not the usual meaning', await visible(page.getByText('Not the usual meaning')));
  await shot('05-sentence-clip.png');
  await page.getByRole('button', { name: /with this sentence/ }).click();
  check('sentence: filed under sense iii', await visible(page.getByText(/sense iii\./)));
  await page.getByRole('button', { name: 'See it in the definition' }).click();
  check('definition shows the saved sentence under its sense', await visible(page.locator('figcaption', { hasText: 'From your reading' })));
  await page.locator('figcaption', { hasText: 'From your reading' }).first().scrollIntoViewIfNeeded();
  await shot('06-clip-sense-iii.png');

  // 5b. Tap another word in a sentence
  await page.getByRole('tab', { name: /Sentence/ }).click();
  await page.getByRole('button', { name: /two engineers out/ }).first().click();
  await visible(page.getByText('Having too much work for the people available.'));
  await page.getByRole('button', { name: 'slip', exact: true }).click();
  check('sentence: tap another word (slip)', await visible(page.getByText('be postponed to a later time', { exact: false })));

  // 6. Notebook
  await page.getByRole('button', { name: 'Notebook', exact: true }).first().click();
  check('notebook: lists fixture words', await visible(page.getByText('go against the grain').first()));
  await shot('07-notebook.png');

  // 7. Review
  await page.getByRole('button', { name: /^Review/ }).first().click();
  await page.waitForTimeout(500);
  await shot('08-review.png');
  const rateBtn = page.getByRole('button', { name: 'Got it' });
  if (!(await rateBtn.isVisible())) {
    // flip the card first
    await page.locator('main').getByText(/tap|reveal|show/i).first().click().catch(() => {});
    await page.locator('main [class*="cursor-pointer"]').first().click().catch(() => {});
  }
  const canRate = await visible(rateBtn, 3000);
  if (canRate) { await rateBtn.click(); await page.waitForTimeout(300); }
  check('review: card can be rated', canRate);
  await shot('09-review-after.png');

  // 8. Podcasts
  await page.getByRole('button', { name: 'Podcasts', exact: true }).first().click();
  check('podcasts: words heard', await visible(page.getByText(/words heard/)));
  await page.getByRole('button', { name: /gauge/ }).first().click();
  check('podcasts: real line, sense-tagged', await visible(page.getByText(/Sense i\./).first()));
  await shot('10-podcasts.png');

  // 9. Ask Lexi
  await page.getByRole('button', { name: /Ask Lexi/ }).click();
  await page.getByRole('button', { name: /appall and shock/ }).click();
  check('ask lexi: canned answer 1', await visible(page.getByText('Quick test:', { exact: false })));
  await page.locator('input[placeholder^="Ask"]').fill('审慎乐观 英文怎么说');
  await page.locator('input[placeholder^="Ask"]').press('Enter');
  check('ask lexi: canned answer 2', await visible(page.getByText('cautiously optimistic', { exact: false })));
  await page.locator('input[placeholder^="Ask"]').fill('What does serendipity mean?');
  await page.locator('input[placeholder^="Ask"]').press('Enter');
  check('ask lexi: other question → demo note', await visible(page.getByText('sign up to ask Lexi your own questions', { exact: false })));
  await shot('11-ask-lexi.png');
  await page.locator('button:has(svg.lucide-x)').last().click().catch(() => {});

  // 10. Settings → note
  await page.getByTitle('Settings').click();
  check('settings: demo note', await visible(page.getByText('sign up to change settings', { exact: false })));
  await shot('12-settings-note.png');

  // Storage isolation: nothing written to the real notebook/stats stores
  const storage = await page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    idb: (await indexedDB.databases?.())?.map(d => d.name) ?? 'n/a',
  }));
  check('storage: no localStorage lexiai_* keys', !storage.local.some(k => k.startsWith('lexiai')), JSON.stringify(storage.local));
  check('storage: no IndexedDB "lexiai" database', Array.isArray(storage.idb) && !storage.idb.includes('lexiai'), JSON.stringify(storage.idb));
  check('storage: demo data in sessionStorage', storage.session.some(k => k.startsWith('lexiai_demo:')), JSON.stringify(storage.session));

  // Network check — everything up to here was demo mode
  const hosts = [...new Set(requests.map(u => { try { return new URL(u).host; } catch { return u; } }))];
  const bad = requests.filter(u => FORBIDDEN.test(new URL(u).host));
  const badApi = bad.filter(u => !/^https:\/\/fonts\.googleapis\.com\//.test(u));
  check('network: no Supabase / Anthropic / Gemini API calls', badApi.length === 0, badApi.join(', '));
  console.log('Hosts contacted in demo:', hosts.join(', '));
  if (bad.length) console.log('googleapis/supabase/anthropic matches (incl. fonts):', bad.join('\n  '));

  // 11. Reload keeps demo changes (sessionStorage), then exit → sign-in
  await page.reload();
  await page.getByRole('button', { name: 'Notebook', exact: true }).first().click();
  check('reload: saved bludgeon still in demo notebook', await visible(page.getByText('bludgeon').first()));
  await page.getByRole('button', { name: 'Exit demo' }).click();
  await page.waitForLoadState('load');
  check('exit: URL has no demo flag', !page.url().includes('demo=1'), page.url());
  check('exit: lands on sign-in form', await visible(page.getByRole('heading', { name: /Sign In|Account/ })));
  check('sign-in form has Try the demo', await visible(page.getByRole('button', { name: 'Try the demo' })));
  await shot('13-exit-signin.png');
  check('exit: demo session data cleared', await page.evaluate(() => !Object.keys(sessionStorage).some(k => k.startsWith('lexiai_demo:'))));

  // 12. Try the demo button → back into demo
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await page.waitForURL(/demo=1/);
  check('Try the demo enters demo mode', await visible(page.getByText('Demo mode', { exact: true })));

  // 13. Normal mode, fresh context: unchanged behaviour
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const p2 = await ctx2.newPage();
  const req2 = [];
  p2.on('request', r => req2.push(r.url()));
  await p2.goto(`${BASE}/`);
  await p2.waitForTimeout(800);
  check('normal: no demo banner', !(await p2.getByText('Demo mode', { exact: true }).isVisible()));
  check('normal: no sample chips', !(await p2.getByText('Try a sample word').isVisible()));
  check('normal: demo fixture chunk not downloaded', !req2.some(u => /fixture-.*\.js/.test(u)));
  check('normal: account pill + debug button shown', await p2.getByTitle('Debug Sync').isVisible());
  const idb2 = await p2.evaluate(async () => (await indexedDB.databases()).map(d => d.name));
  check('normal: real notebook store (IndexedDB "lexiai") used', idb2.includes('lexiai'), JSON.stringify(idb2));
  await p2.waitForTimeout(900);
  await p2.screenshot({ path: path.join(OUT, '14-normal-mode.png') });

  console.log('Console errors (demo run):', consoleErrors.length ? consoleErrors.join('\n  ') : 'none');
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
