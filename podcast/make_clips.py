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
import hashlib, json, os, shutil, sqlite3, subprocess, sys, tempfile, time

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
UPLOAD_BATCH = 100


def storage(*args):
    out = subprocess.run(["supabase", "storage", *args, "--linked", "--experimental", "--output-format", "json"],
                         cwd=REPO, capture_output=True, text=True, timeout=1800)
    if out.returncode != 0:
        problems = [l for l in (out.stderr + out.stdout).splitlines()
                    if l.strip() and not l.startswith(("Uploading", "A new version", "We recommend"))]
        raise RuntimeError(" | ".join(problems[-5:]) or f"exit {out.returncode}")
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
    if state and len(stale) > 0.5 * len(state) and len(stale) > 50:
        raise SystemExit(f"refusing to delete {len(stale)} of {len(state)} clips at once — check the inputs")
    if stale:
        for i in range(0, len(stale), 100):
            storage("rm", "--yes", *[f"ss:///{BUCKET}/{state[k][0]}" for k in stale[i:i + 100]])
        run_batched("update public.podcast_lines set clip_path = null where id in (", [str(int(k)) for k in stale], ");")
        for k in stale:
            state.pop(k)
        json.dump(state, open(STATE, "w"))

    used = sum(b for _n, b in state.values())
    new = [i for i in wanted if str(i) not in state]
    print(f"clips: {len(state)} kept, {len(stale)} removed, {len(new)} to cut · {used / 1e6:.0f} MB used", flush=True)
    os.makedirs(CLIP_DIR, exist_ok=True)
    stage_root = tempfile.mkdtemp(prefix="clips-")
    try:
        cut_ok = []
        for i in new:
            if used >= BUDGET_MB * 1e6:
                print(f"! storage budget of {BUDGET_MB} MB reached — remaining lines stay text-only", flush=True)
                break
            ep, s, e, t, cs, ce = lines[i]
            dest = os.path.join(CLIP_DIR, os.path.basename(wanted_names[i]))
            try:
                cut(ep, s, e, cs, ce, dest)
            except subprocess.CalledProcessError:
                continue
            used += os.path.getsize(dest)
            cut_ok.append(i)
        # Upload in batches; each batch is recorded as soon as it lands, so a failure loses nothing.
        for b in range(0, len(cut_ok), UPLOAD_BATCH):
            batch = cut_ok[b:b + UPLOAD_BATCH]
            # `storage cp -r <dir>` uploads under the directory's own name, so stage into ".../clips".
            staging = os.path.join(stage_root, "clips")
            shutil.rmtree(staging, ignore_errors=True)
            os.makedirs(staging)
            for i in batch:
                f = os.path.basename(wanted_names[i])
                shutil.copy(os.path.join(CLIP_DIR, f), os.path.join(staging, f))
            for attempt in range(3):
                try:
                    storage("cp", "-r", "-j", "2", "--content-type", "audio/mpeg", staging, f"ss:///{BUCKET}/")
                    break
                except RuntimeError as err:
                    # The Free plan answers 429 "too many connections" to bursts — back off.
                    print(f"  upload retry {attempt + 1}: {str(err)[:120]}", flush=True)
                    time.sleep(30 * (attempt + 1))
            else:
                print("! upload failed three times — will retry next run", flush=True)
                continue
            run_batched("update public.podcast_lines set clip_path = v.p from (values ",
                        [f"({i}, {q(wanted_names[i])})" for i in batch],
                        ") as v(id, p) where podcast_lines.id = v.id;")
            for i in batch:
                state[str(i)] = [wanted_names[i], os.path.getsize(os.path.join(CLIP_DIR, os.path.basename(wanted_names[i])))]
            json.dump(state, open(STATE, "w"))
            print(f"  uploaded {b + len(batch)}/{len(cut_ok)}", flush=True)
            time.sleep(3)
    finally:
        shutil.rmtree(stage_root, ignore_errors=True)
        json.dump(state, open(STATE, "w"))
    print(f"clips: {len(state)} in bucket · {sum(b for _n, b in state.values()) / 1e6:.0f} MB", flush=True)


if __name__ == "__main__":
    main()
