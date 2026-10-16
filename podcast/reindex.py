"""Re-transcribe episodes that have no audio copy yet, so clips can be cut that match the text.

Episodes indexed before audio copies were kept were transcribed from audio that no longer
exists in that form: publishers' dynamic ads change what a fresh download contains. So each
such episode is downloaded once more, transcribed again, and its audio kept
(data/audio/<id>.opus); its old sentences are replaced. Resumable — finished episodes are
skipped. Every BATCH episodes the example library is rebuilt, synced and clips are cut.

Usage: python3 reindex.py [--limit N]
"""
import argparse, os, sqlite3, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from ingest import DB, archive_path, transcribe, sentences, write_sentences

BATCH = 10
VENV_PY = os.path.join(HERE, ".venv", "bin", "python")


def refresh_library():
    subprocess.run([VENV_PY, "build_examples.py", "--phrases-from-notebook"], cwd=HERE, check=False)
    subprocess.run([sys.executable, "sync_examples.py"], cwd=HERE, check=False)
    subprocess.run([VENV_PY, "make_clips.py"], cwd=HERE, check=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    con = sqlite3.connect(DB)
    todo = [(eid, show, title, url) for eid, show, title, url in
            con.execute("SELECT id, show, title, audio_url FROM episodes ORDER BY kind = 'everyday' DESC, id")
            if not os.path.exists(archive_path(eid))]
    if args.limit:
        todo = todo[:args.limit]
    print(f"{len(todo)} episodes to re-transcribe with an audio copy", flush=True)
    done = 0
    for eid, show, title, url in todo:
        print(f"→ {show} — {title[:70]}", flush=True)
        tmp_archive = archive_path(eid) + ".part"
        try:
            sents = list(sentences(transcribe(url, archive=tmp_archive)))
        except Exception as e:
            print(f"  ! failed: {e}", flush=True)
            if os.path.exists(tmp_archive):
                os.remove(tmp_archive)
            continue
        old = con.execute("SELECT id, text FROM sentences WHERE episode_id=?", (eid,)).fetchall()
        for sid, text in old:
            con.execute("INSERT INTO sentences_fts(sentences_fts, rowid, text) VALUES('delete', ?, ?)", (sid, text))
        con.execute("DELETE FROM sentences WHERE episode_id=?", (eid,))
        write_sentences(con, eid, sents)
        con.execute("UPDATE episodes SET duration=? WHERE id=?", (sents[-1][1] if sents else 0, eid))
        con.commit()
        os.replace(tmp_archive, archive_path(eid))
        print(f"  ✓ {len(sents)} sentences (was {len(old)})", flush=True)
        done += 1
        if done % BATCH == 0:
            refresh_library()
    if done % BATCH:
        refresh_library()
    remaining = sum(1 for (eid,) in con.execute("SELECT id FROM episodes") if not os.path.exists(archive_path(eid)))
    print(f"=== reindex pass done: {done} re-transcribed, {remaining} without audio copy", flush=True)
    if remaining == 0 or not todo:
        open(os.path.join(HERE, "data", "reindex.done"), "w").close()


if __name__ == "__main__":
    main()
