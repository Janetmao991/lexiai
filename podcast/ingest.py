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


AUDIO_DIR = os.path.join(HERE, "data", "audio")


def archive_path(episode_id):
    """Low-bitrate copy of the exact audio an episode was transcribed from. Clips are cut
    from it, because the publisher's live file carries different (dynamic) ads every time."""
    return os.path.join(AUDIO_DIR, f"{episode_id}.opus")


def transcribe(audio_url, archive=None):
    with tempfile.TemporaryDirectory() as tmp:
        audio = os.path.join(tmp, "ep.mp3")
        req = urllib.request.Request(audio_url, headers=UA)
        with urllib.request.urlopen(req, timeout=300) as r, open(audio, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        if archive:
            os.makedirs(os.path.dirname(archive), exist_ok=True)
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", audio, "-vn", "-ac", "1", "-ar", "16000",
                            "-c:a", "libopus", "-b:a", "20k", "-f", "ogg", archive], check=True)
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


DIG_POOL = os.path.expanduser(
    "~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Janet's brain/Janet's AI Brain/Podcast Research/podcast-pool.json")


def title_key(t):
    return re.sub(r"[^a-z0-9]", "", (t or "").lower())[:60]


def show_key(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())[:8]


def dig_transcript(show, title):
    """Sentences from podcast-dig's own Whisper transcript of this episode, if it has one —
    so the same episode is never transcribed twice. Paragraph timestamps ([mm:ss]) are
    spread over the paragraph's sentences by word position."""
    if not os.path.exists(DIG_POOL):
        return None
    vault = os.path.dirname(os.path.dirname(DIG_POOL))
    for e in json.load(open(DIG_POOL)).get("episodes", []):
        if e.get("transcript_source") != "whisper-local" or not e.get("transcript_file"):
            continue
        if title_key(e.get("episode_title")) != title_key(title) or show_key(e.get("show")) != show_key(show):
            continue
        path = os.path.join(vault, e["transcript_file"])
        if not os.path.exists(path):
            continue
        body = open(path, encoding="utf-8").read().split("## Transcript", 1)[-1]
        paras = []
        for m in re.finditer(r"^\[(\d+(?::\d{2}){1,2})\]\s*(.+)$", body, re.M):
            secs = 0
            for part in m.group(1).split(":"):
                secs = secs * 60 + int(part)
            text = re.sub(r"==|★|\[定位\]|\*\*[^*]+:\*\*|<!--.*?-->", "", m.group(2)).strip()
            if text:
                paras.append((secs, text))
        out = []
        for i, (t0, text) in enumerate(paras):
            t1 = paras[i + 1][0] if i + 1 < len(paras) else t0 + 30
            sents = [x.strip() for x in re.split(r"(?<=[.?!])\s+", text) if x.strip()]
            total = sum(len(x.split()) for x in sents) or 1
            seen = 0
            for x in sents:
                n = len(x.split())
                start = t0 + (t1 - t0) * seen / total
                seen += n
                if n >= 4:
                    out.append((start, t0 + (t1 - t0) * seen / total, x))
        return out or None
    return None


def write_sentences(con, episode_id, sents):
    for start, end, text in sents:
        sid = con.execute("INSERT INTO sentences(episode_id,start,end,text) VALUES(?,?,?,?)",
                          (episode_id, start, end, text)).lastrowid
        con.execute("INSERT INTO sentences_fts(rowid,text) VALUES(?,?)", (sid, text))


def index_episode(con, show_name, kind, ep):
    """Add one episode to the corpus: reuse podcast-dig's transcript if it has one, else
    Whisper — keeping an audio copy so clips line up with the transcript."""
    cur = con.execute("INSERT INTO episodes(show,kind,title,published,audio_url,link,duration) VALUES(?,?,?,?,?,?,0)",
                      (show_name, kind, ep["title"], ep.get("published", ""), ep["audio_url"], ep.get("link", "")))
    eid = cur.lastrowid
    try:
        sents = dig_transcript(show_name, ep["title"])
        if sents:
            print("  ↺ reusing podcast-dig's Whisper transcript (no audio copy, so no clips)", flush=True)
        else:
            sents = list(sentences(transcribe(ep["audio_url"], archive=archive_path(eid))))
    except Exception:
        con.rollback()
        raise
    dur = sents[-1][1] if sents else 0
    con.execute("UPDATE episodes SET duration=? WHERE id=?", (dur, eid))
    write_sentences(con, eid, sents)
    con.commit()
    print(f"  ✓ {len(sents)} sentences, {dur/60:.0f} min", flush=True)
    return eid


def spread_order(n):
    """Indices 0..n-1 in an order that keeps spreading out: 0, n/2, n/4, 3n/4, n/8, …"""
    seen, order, k = set(), [], 0
    while len(order) < n and k < 4 * n:
        k += 1
        f, denom, i = 0.0, 1.0, k - 1
        while i:  # van der Corput sequence in base 2
            denom *= 2; f += (i & 1) / denom; i >>= 1
        idx = min(n - 1, int(f * n))
        if idx not in seen:
            seen.add(idx); order.append(idx)
    return order + [i for i in range(n) if i not in seen]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-show", type=int, default=2)
    ap.add_argument("--show", help="substring filter on show name")
    ap.add_argument("--kind", help="only shows of this kind (everyday | work)")
    ap.add_argument("--spread", action="store_true",
                    help="pick episodes evenly across the whole back catalog instead of newest first")
    ap.add_argument("--add", type=int, default=0, help="index N more episodes per show (overrides --per-show)")
    # Single-episode mode (used by podcast-dig): index exactly this episode.
    ap.add_argument("--audio-url", help="index one episode by its enclosure URL (needs --title, --show-name)")
    ap.add_argument("--title")
    ap.add_argument("--show-name")
    args = ap.parse_args()
    if args.audio_url:
        con = db()
        row = con.execute("SELECT id FROM episodes WHERE audio_url=?", (args.audio_url,)).fetchone()
        if row:
            print(f"already indexed: episode {row[0]}"); return
        print(f"→ {args.show_name} — {(args.title or '')[:70]}", flush=True)
        index_episode(con, args.show_name or "", args.kind or "work",
                      {"title": args.title or "", "audio_url": args.audio_url})
        return
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
        # Target = total indexed episodes for this show. For word examples recency doesn't
        # matter, so --spread samples the whole archive for more varied topics and guests.
        done = con.execute("SELECT count(*) FROM episodes WHERE show=?", (show["name"],)).fetchone()[0]
        target = done + args.add if args.add else args.per_show
        order = spread_order(len(items)) if args.spread else range(len(items))
        for idx in order:
            ep = items[idx]
            if done >= target:
                break
            if con.execute("SELECT 1 FROM episodes WHERE audio_url=?", (ep["audio_url"],)).fetchone():
                continue
            print(f"→ {show['name']} — {ep['title'][:70]}", flush=True)
            try:
                index_episode(con, show["name"], show["kind"], ep)
            except Exception as e:
                print(f"  ! transcription failed: {e}"); continue
            done += 1


if __name__ == "__main__":
    main()
