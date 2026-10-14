"""Upload newly transcribed episodes from data/corpus.db to Supabase (podcast_* tables).

Runs SQL through the Supabase CLI (`supabase db query --linked`), so it uses the CLI's
login — no service key on disk. Stays inside the Free plan:
  * refuses to upload once the database passes SIZE_LIMIT_MB,
  * skips sentences under 5 words and lines repeated across episodes (ads, trailers),
  * afterwards deletes any line that ended up in more than one episode server-side.
Synced episode ids are kept in data/synced.json.

Usage: python3 sync_supabase.py [--limit N]
"""
import argparse, json, os, re, sqlite3, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DB = os.path.join(HERE, "data", "corpus.db")
STATE = os.path.join(HERE, "data", "synced.json")
SIZE_LIMIT_MB = 350
CHUNK = 400


def run_sql(sql):
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
        f.write(sql)
        path = f.name
    try:
        out = subprocess.run(["supabase", "db", "query", "--linked", "-f", path],
                             cwd=REPO, capture_output=True, text=True, timeout=180)
    finally:
        os.unlink(path)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[-500:])
    start = out.stdout.find("{")
    return json.loads(out.stdout[start:]).get("rows", []) if start >= 0 else []


def q(s):
    return "'" + (s or "").replace("\x00", "").replace("'", "''") + "'"


def db_size_mb():
    rows = run_sql("select pg_database_size(current_database()) as bytes;")
    return int(rows[0]["bytes"]) / 1_048_576


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="max episodes this run (0 = all)")
    args = ap.parse_args()

    synced = set(json.load(open(STATE))) if os.path.exists(STATE) else set()
    con = sqlite3.connect(DB)
    repeated = {t for (t,) in con.execute(
        "SELECT text FROM sentences GROUP BY text HAVING count(DISTINCT episode_id) > 1")}
    episodes = [e for e in con.execute(
        "SELECT id, show, kind, title, published, audio_url, link FROM episodes ORDER BY id") if e[0] not in synced]
    if args.limit:
        episodes = episodes[:args.limit]
    if not episodes:
        print("Nothing new to sync."); return

    size = db_size_mb()
    print(f"Database: {size:.0f} MB used (stop at {SIZE_LIMIT_MB} MB, Free plan cap 500 MB)")
    uploaded = 0
    for eid, show, kind, title, pub, url, link in episodes:
        if size >= SIZE_LIMIT_MB:
            print(f"! Stopped: database at {size:.0f} MB — over the {SIZE_LIMIT_MB} MB safety limit."); break
        rows = [r for r in con.execute("SELECT start, end, text FROM sentences WHERE episode_id=? ORDER BY start", (eid,))
                if len(r[2].split()) >= 5 and r[2] not in repeated]
        stmts = [
            f"delete from public.podcast_episodes where id = {eid};",
            "insert into public.podcast_episodes (id, show, kind, title, published, audio_url, link) values "
            f"({eid}, {q(show)}, {q(kind)}, {q(title)}, {q(pub)}, {q(url)}, {q(link)});",
        ]
        run_sql("\n".join(stmts))
        for i in range(0, len(rows), CHUNK):
            values = ",\n".join(f"({eid}, {s:.2f}, {e:.2f}, {q(t)})" for s, e, t in rows[i:i + CHUNK])
            run_sql(f"insert into public.podcast_sentences (episode_id, start_s, end_s, text) values\n{values};")
        synced.add(eid)
        json.dump(sorted(synced), open(STATE, "w"))
        uploaded += 1
        print(f"✓ {show} — {title[:60]} ({len(rows)} sentences)", flush=True)
        if uploaded % 20 == 0:
            size = db_size_mb()

    # Lines that turned out to repeat across episodes after earlier uploads are ads/trailers.
    run_sql("""delete from public.podcast_sentences where text in (
      select text from public.podcast_sentences group by text having count(distinct episode_id) > 1);""")
    print(f"Done: {uploaded} episodes uploaded. Database now {db_size_mb():.0f} MB.")


if __name__ == "__main__":
    main()
