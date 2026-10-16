"""Cut our own audio clips for notebook words and upload them to the private bucket.

For every word in the LexiAI notebook, the top CLIPS_PER_WORD example lines (from
data/examples.db) get a clip covering the sentence before, the line and the sentence after,
cut from the episode's own audio copy (data/audio/<id>.opus — the exact audio that was
transcribed, so the words line up). Clips are small MP3s (mono 16 kHz, 24 kbps, ≤ MAX_SECS)
in Supabase Storage bucket "podcast-clips"; podcast_lines.clip_path points to them.
Stays inside the Free plan's 1 GB of storage: stops adding clips at BUDGET_MB.
Uploaded state lives in data/clips.json. Run with the podcast venv (needs lemminflect).

Usage: .venv/bin/python make_clips.py
"""
import hashlib, json, os, shutil, sqlite3, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from build_examples import lemmas, notebook_words
from ingest import archive_path
from sync_examples import run_sql, run_batched, q

EXAMPLES = os.path.join(HERE, "data", "examples.db")
CLIP_DIR = os.path.join(HERE, "data", "clips")
STATE = os.path.join(HERE, "data", "clips.json")
BUCKET = "podcast-clips"
CLIPS_PER_WORD = 3
MAX_SECS = 25
BUDGET_MB = 800


def storage(*args):
    out = subprocess.run(["supabase", "storage", *args, "--linked", "--experimental"],
                         cwd=REPO, capture_output=True, text=True, timeout=1800)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[-400:] or out.stdout.strip()[-400:])
    return out.stdout


def clip_name(line_id, text):
    """Object path in the bucket (also stored in podcast_lines.clip_path)."""
    return f"clips/{line_id}-{hashlib.md5(text.encode()).hexdigest()[:6]}.mp3"


def cut(episode_id, start, end, ctx_start, ctx_end, dest):
    a, b = ctx_start - 0.3, ctx_end + 0.3
    if b - a > MAX_SECS:  # long neighbours: keep the line itself with a little air
        a, b = start - 1.5, min(end + 1.5, start - 1.5 + MAX_SECS)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", f"{max(0, a):.2f}", "-to", f"{b:.2f}",
                    "-i", archive_path(episode_id), "-ac", "1", "-ar", "16000",
                    "-c:a", "libmp3lame", "-b:a", "24k", dest], check=True)


def main():
    state = json.load(open(STATE)) if os.path.exists(STATE) else {}   # line_id -> [name, bytes]
    ex = sqlite3.connect(EXAMPLES)
    lines = {i: (ep, s, e, t, cs, ce) for i, ep, s, e, t, cs, ce in
             ex.execute("SELECT id, episode_id, start, end, text, ctx_start, ctx_end FROM lines")}
    by_lemma = {}
    for lemma, line_id, rank in ex.execute("SELECT lemma, line_id, rank FROM examples ORDER BY rank"):
        by_lemma.setdefault(lemma, []).append(line_id)

    wanted = []          # in notebook order, so the budget goes to words first come
    seen = set()
    for w in notebook_words():
        keys = [w] if " " in w else sorted(lemmas(w))
        picked = 0
        for key in keys:
            for line_id in by_lemma.get(key, []):
                if picked >= CLIPS_PER_WORD:
                    break
                if line_id in lines and os.path.exists(archive_path(lines[line_id][0])):
                    picked += 1
                    if line_id not in seen:
                        seen.add(line_id); wanted.append(line_id)
    wanted_names = {i: clip_name(i, lines[i][3]) for i in wanted}

    # Drop clips whose line left the library or whose text changed (re-transcribed).
    stale = [k for k, (name, _b) in state.items() if wanted_names.get(int(k)) != name]
    if stale:
        for i in range(0, len(stale), 100):
            storage("rm", "--yes", *[f"ss:///{BUCKET}/{state[k][0]}" for k in stale[i:i + 100]])
        run_batched("update public.podcast_lines set clip_path = null where id in (", [str(int(k)) for k in stale], ");")
        for k in stale:
            state.pop(k)

    used = sum(b for _n, b in state.values())
    new = [i for i in wanted if str(i) not in state]
    print(f"clips: {len(state)} kept, {len(stale)} removed, {len(new)} to cut · {used / 1e6:.0f} MB used", flush=True)
    os.makedirs(CLIP_DIR, exist_ok=True)
    # `storage cp -r <dir>` uploads under the directory's own name, so stage into ".../clips".
    stage_root = tempfile.mkdtemp(prefix="clips-")
    staging = os.path.join(stage_root, "clips")
    os.makedirs(staging)
    added = {}
    try:
        for i in new:
            if used >= BUDGET_MB * 1e6:
                print(f"! storage budget of {BUDGET_MB} MB reached — remaining lines stay text-only", flush=True)
                break
            ep, s, e, t, cs, ce = lines[i]
            dest = os.path.join(staging, os.path.basename(wanted_names[i]))
            try:
                cut(ep, s, e, cs, ce, dest)
            except subprocess.CalledProcessError:
                continue
            size = os.path.getsize(dest)
            used += size
            added[str(i)] = [wanted_names[i], size]
        if added:
            storage("cp", "-r", "-j", "8", "--content-type", "audio/mpeg", staging, f"ss:///{BUCKET}/")
            run_batched("update public.podcast_lines set clip_path = v.p from (values ",
                        [f"({int(k)}, {q(name)})" for k, (name, _b) in added.items()],
                        ") as v(id, p) where podcast_lines.id = v.id;")
            for f in os.listdir(staging):
                shutil.move(os.path.join(staging, f), os.path.join(CLIP_DIR, f))
            state.update(added)
            json.dump(state, open(STATE, "w"))
    finally:
        shutil.rmtree(stage_root, ignore_errors=True)
    print(f"clips: {len(state)} in bucket · {sum(b for _n, b in state.values()) / 1e6:.0f} MB", flush=True)


if __name__ == "__main__":
    main()
