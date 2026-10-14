"""Find where a word or phrase was said in the indexed podcasts.

Usage: python3 search.py coup [--limit 5] [--json]
Each hit has the sentence, show, episode, start time and a playable URL
(publisher's audio + #t=<start-2>,<end+1> media fragment).
"""
import argparse, json, os, re, sqlite3

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "corpus.db")


def inflection_pattern(term):
    """Regex for the term and its inflections only (gauge → gauges/gauged/gauging), so the
    Porter-stemmed FTS match can't drift to related words (integral → integrity)."""
    def forms(w):
        w = re.escape(w.lower())
        alts = {w, w + "s", w + "es", w + "ed", w + "d", w + "ing", w + "'s", w + "’s"}
        if w.endswith("e"):
            alts |= {w[:-1] + "ing"}
        if w.endswith("y"):
            alts |= {w[:-1] + "ies", w[:-1] + "ied"}
        if re.search(r"[^aeiou][aeiou][bdgmnprt]$", w):  # stop → stopped/stopping
            alts |= {w + w[-1] + "ed", w + w[-1] + "ing"}
        return "(?:" + "|".join(sorted(alts, key=len, reverse=True)) + ")"
    words = term.split()
    # Inflect the head word of a phrase ("crop up" → "cropped up"); keep the rest literal.
    parts = [forms(words[0])] + [re.escape(x.lower()) for x in words[1:]]
    return re.compile(r"(?<![\w-])" + r"[\s-]+".join(parts) + r"(?![\w-])", re.I)


def search(term, limit=5):
    con = sqlite3.connect(DB)
    # Porter stemming matches inflections (coup/coups, gauge/gauging); quotes keep phrases together.
    q = '"' + term.replace('"', "") + '"'
    rows = con.execute("""
      SELECT s.text, s.start, s.end, e.show, e.kind, e.title, e.published, e.audio_url
      FROM sentences_fts f JOIN sentences s ON s.id = f.rowid JOIN episodes e ON e.id = s.episode_id
      WHERE sentences_fts MATCH ?
      ORDER BY (e.kind = 'everyday') DESC, length(s.text) ASC
      LIMIT ?""", (q, limit * 20)).fetchall()
    pat = inflection_pattern(term)
    hits, per_episode = [], {}
    for text, start, end, show, kind, title, pub, url in rows:
        if not pat.search(text):
            continue
        # The same line in several episodes is a trailer or ad read, not conversation.
        if con.execute("SELECT count(DISTINCT episode_id) FROM sentences WHERE text = ?", (text,)).fetchone()[0] > 1:
            continue
        # Spread results across episodes rather than five lines from one show.
        if per_episode.get(url, 0) >= 2:
            continue
        per_episode[url] = per_episode.get(url, 0) + 1
        hits.append({"text": text, "show": show, "kind": kind, "episode": title, "published": pub,
                     "start": round(start, 1), "end": round(end, 1),
                     "clip": f"{url}#t={max(0, start - 2):.1f},{end + 1:.1f}"})
        if len(hits) >= limit:
            break
    return hits


def mmss(t):
    return f"{int(t // 60)}:{int(t % 60):02d}"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("term")
    ap.add_argument("--limit", type=int, default=5)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    hits = search(a.term, a.limit)
    if a.json:
        print(json.dumps(hits, ensure_ascii=False, indent=2))
    else:
        if not hits:
            print(f"No clips for “{a.term}” yet.")
        for h in hits:
            print(f"• {h['text']}\n  {h['show']} — {h['episode'][:60]} @ {mmss(h['start'])}\n  ▶ {h['clip']}\n")
