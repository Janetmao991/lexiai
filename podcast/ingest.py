"""Index podcast episodes for word lookup.

For each show in shows.json: read the RSS feed, take the newest N episodes not yet indexed,
download the audio to a temp file, transcribe locally with mlx_whisper (word timestamps),
split into sentences, and store them in data/corpus.db (SQLite FTS5). The audio file is
deleted afterwards — clips are played later from the publisher's own enclosure URL.

Usage: python3 ingest.py [--per-show 2] [--show "Mel Robbins"]
"""
import argparse, json, os, re, sqlite3, subprocess, tempfile, urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "data", "corpus.db")
MODEL = "mlx-community/whisper-large-v3-turbo"
UA = {"User-Agent": "LexiAI-podcast-indexer/0.1"}


def db():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    con = sqlite3.connect(DB)
    con.executescript("""
    CREATE TABLE IF NOT EXISTS episodes(
      id INTEGER PRIMARY KEY, show TEXT, kind TEXT, title TEXT, published TEXT,
      audio_url TEXT UNIQUE, link TEXT, duration REAL);
    CREATE TABLE IF NOT EXISTS sentences(
      id INTEGER PRIMARY KEY, episode_id INTEGER, start REAL, end REAL, text TEXT);
    CREATE VIRTUAL TABLE IF NOT EXISTS sentences_fts USING fts5(
      text, content='sentences', content_rowid='id', tokenize='porter unicode61');
    """)
    return con


def feed_items(url):
    raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
    root = ET.fromstring(raw)
    for item in root.iter("item"):
        enc = item.find("enclosure")
        if enc is None or not enc.get("url"):
            continue
        pub = item.findtext("pubDate") or ""
        try:
            pub = parsedate_to_datetime(pub).date().isoformat()
        except Exception:
            pass
        yield {"title": (item.findtext("title") or "").strip(), "published": pub,
               "audio_url": enc.get("url"), "link": item.findtext("link") or ""}


def transcribe(audio_url):
    with tempfile.TemporaryDirectory() as tmp:
        audio = os.path.join(tmp, "ep.mp3")
        req = urllib.request.Request(audio_url, headers=UA)
        with urllib.request.urlopen(req, timeout=300) as r, open(audio, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        subprocess.run(["mlx_whisper", audio, "--model", MODEL, "--language", "en",
                        "--word-timestamps", "True", "--output-format", "json",
                        "--output-dir", tmp, "--output-name", "ep", "--verbose", "False"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        with open(os.path.join(tmp, "ep.json")) as f:
            return json.load(f)


def sentences(result):
    """Re-split Whisper's word stream on sentence-final punctuation."""
    words = [w for seg in result.get("segments", []) for w in seg.get("words", [])]
    cur, out = [], []
    for w in words:
        cur.append(w)
        if re.search(r"[.?!]['\"”’]?$", w["word"].strip()) and len(cur) >= 3:
            out.append(cur); cur = []
    if cur:
        out.append(cur)
    for s in out:
        text = "".join(w["word"] for w in s).strip()
        if len(text.split()) >= 4:
            yield s[0]["start"], s[-1]["end"], text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-show", type=int, default=2)
    ap.add_argument("--show", help="substring filter on show name")
    ap.add_argument("--kind", help="only shows of this kind (everyday | work)")
    args = ap.parse_args()
    shows = json.load(open(os.path.join(HERE, "shows.json")))["shows"]
    if args.kind:
        shows = [s for s in shows if s["kind"] == args.kind]
    con = db()
    for show in shows:
        if args.show and args.show.lower() not in show["name"].lower():
            continue
        try:
            items = list(feed_items(show["feed"]))
        except Exception as e:
            print(f"! {show['name']}: feed failed ({e})"); continue
        done = 0
        for ep in items:
            if done >= args.per_show:
                break
            if con.execute("SELECT 1 FROM episodes WHERE audio_url=?", (ep["audio_url"],)).fetchone():
                done += 1; continue
            print(f"→ {show['name']} — {ep['title'][:70]}", flush=True)
            try:
                result = transcribe(ep["audio_url"])
            except Exception as e:
                print(f"  ! transcription failed: {e}"); continue
            sents = list(sentences(result))
            dur = sents[-1][1] if sents else 0
            cur = con.execute("INSERT INTO episodes(show,kind,title,published,audio_url,link,duration) VALUES(?,?,?,?,?,?,?)",
                              (show["name"], show["kind"], ep["title"], ep["published"], ep["audio_url"], ep["link"], dur))
            for start, end, text in sents:
                sid = con.execute("INSERT INTO sentences(episode_id,start,end,text) VALUES(?,?,?,?)",
                                  (cur.lastrowid, start, end, text)).lastrowid
                con.execute("INSERT INTO sentences_fts(rowid,text) VALUES(?,?)", (sid, text))
            con.commit()
            print(f"  ✓ {len(sents)} sentences, {dur/60:.0f} min", flush=True)
            done += 1


if __name__ == "__main__":
    main()
