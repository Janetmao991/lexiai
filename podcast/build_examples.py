"""Pick the best few podcast lines for every word — the "Heard in podcasts" library.

Looking up a word needs a handful of good examples, not every line ever said, and not the
newest ones. So from the full local corpus (data/corpus.db) this keeps, per lemma, at most
K_EVERYDAY lines from everyday shows plus K_WORK from work shows, each from a different
episode, preferring 8–30-word sentences. Very common words (Zipf >= COMMON) are skipped —
nobody looks up "make" — and notebook phrases ("crop up", "at odds with") get their own
entries. Result: data/examples.db (lines, examples), uploaded by sync_examples.py.
The library stops growing once words hit their cap, whatever the corpus size.

Run with the podcast venv: .venv/bin/python build_examples.py [--phrases-from-notebook]
"""
import argparse, json, os, re, sqlite3, subprocess, sys
from collections import defaultdict
from wordfreq import zipf_frequency
from lemminflect import getAllLemmas

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from search import inflection_pattern

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.join(HERE, "data", "corpus.db")
OUT = os.path.join(HERE, "data", "examples.db")
K_EVERYDAY, K_WORK = 4, 2
COMMON = 4.8          # Zipf frequency; >= this is everyday vocabulary (top few thousand words)
AD_CUES = re.compile(r"promo code|use code|sponsor|\.com\b|link in (the|my) |download (the|our) app", re.I)
TOKEN = re.compile(r"[a-z]+(?:[-'’][a-z]+)*")

_lemma_cache = {}


def lemmas(tok):
    if tok not in _lemma_cache:
        found = {l.lower() for ls in getAllLemmas(tok).values() for l in ls}
        _lemma_cache[tok] = found or {tok}
    return _lemma_cache[tok]


def notebook_words():
    """Every headword in the LexiAI notebook (lower-cased), read through the Supabase CLI login."""
    out = subprocess.run(["supabase", "db", "query", "--linked",
                          "select distinct lower(word) as w from public.words"],
                         cwd=os.path.dirname(HERE), capture_output=True, text=True, timeout=120)
    start = out.stdout.find("{")
    rows = json.loads(out.stdout[start:]).get("rows", []) if start >= 0 else []
    return [r["w"].strip() for r in rows if r["w"].strip()]


def quality(text, kind):
    n = len(text.split())
    return (2 if kind == "everyday" else 0) + (1 if 8 <= n <= 30 else 0) - abs(n - 16) / 100


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phrases-from-notebook", action="store_true", help="also index notebook phrases and report notebook coverage")
    args = ap.parse_args()

    con = sqlite3.connect(CORPUS)
    repeated = {t for (t,) in con.execute(
        "SELECT text FROM sentences GROUP BY text HAVING count(DISTINCT episode_id) > 1")}
    rows = [r for r in con.execute(
        "SELECT s.id, s.episode_id, s.start, s.end, s.text, e.kind FROM sentences s JOIN episodes e ON e.id = s.episode_id")
        if len(r[4].split()) >= 5 and r[4] not in repeated and not AD_CUES.search(r[4])]

    cands = defaultdict(list)  # lemma -> [(score, sid, episode, kind)]
    for sid, ep, _s, _e, text, kind in rows:
        q = quality(text, kind)
        for tok in set(TOKEN.findall(text.lower().replace("’", "'"))):
            for lem in lemmas(tok):
                if zipf_frequency(lem, "en") < COMMON:
                    cands[lem].append((q, sid, ep, kind))

    notebook = notebook_words() if args.phrases_from_notebook else []
    if notebook:
        phrases = [w for w in notebook if " " in w]
        pats = {p: inflection_pattern(p) for p in phrases}
        firsts = defaultdict(list)
        for p in phrases:
            firsts[p.split()[0]].append(p)
        for sid, ep, _s, _e, text, kind in rows:
            low = text.lower()
            for first, ps in firsts.items():
                if first[:4] in low:  # cheap prefilter before the regex
                    for p in ps:
                        if pats[p].search(text):
                            cands[p].append((quality(text, kind), sid, ep, kind))
        print(f"notebook phrases: {len(phrases)}")

    examples, keep = [], set()
    for lem, c in cands.items():
        c.sort(reverse=True)
        eps, taken = set(), {"everyday": 0, "work": 0}
        cap = {"everyday": K_EVERYDAY, "work": K_WORK}
        for q, sid, ep, kind in c:
            if ep in eps or taken[kind] >= cap[kind]:
                continue
            eps.add(ep); taken[kind] += 1
            examples.append((lem, sid, len(eps)))
            keep.add(sid)
            if taken["everyday"] >= K_EVERYDAY and taken["work"] >= K_WORK:
                break

    if os.path.exists(OUT):
        os.remove(OUT)
    out = sqlite3.connect(OUT)
    out.executescript("""
      CREATE TABLE lines(id INTEGER PRIMARY KEY, episode_id INTEGER, start REAL, end REAL, text TEXT);
      CREATE TABLE examples(lemma TEXT, line_id INTEGER, rank INTEGER, PRIMARY KEY(lemma, line_id));""")
    out.executemany("INSERT INTO lines VALUES (?,?,?,?,?)",
                    [(sid, ep, s, e, t) for sid, ep, s, e, t, _k in rows if sid in keep])
    out.executemany("INSERT INTO examples VALUES (?,?,?)", examples)
    out.commit()
    print(f"{len(cands)} words · {len(examples)} examples · {len(keep)} lines kept of {len(rows)}")
    if notebook:
        covered = sum(1 for w in notebook if w in cands or (" " not in w and lemmas(w) & cands.keys()))
        pct = 100 * covered / len(notebook)
        print(f"notebook coverage: {covered}/{len(notebook)} = {pct:.1f}%")
        json.dump({"coverage": round(pct, 2), "covered": covered, "notebook": len(notebook),
                   "episodes": con.execute("SELECT count(*) FROM episodes").fetchone()[0]},
                  open(os.path.join(HERE, "data", "coverage.json"), "w"))


if __name__ == "__main__":
    main()
