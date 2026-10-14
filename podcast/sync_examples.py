"""Mirror data/examples.db (built by build_examples.py) to Supabase, uploading only changes.

The last uploaded state is kept in data/uploaded.json; each run diffs against it, deletes
examples and lines that dropped out, and inserts the new ones. SQL goes through the
Supabase CLI login (`supabase db query --linked`), so no service key is stored.
Refuses to grow the database past SIZE_LIMIT_MB (Free plan cap is 500 MB).

Usage: python3 sync_examples.py
"""
import json, os, sqlite3, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
CORPUS = os.path.join(HERE, "data", "corpus.db")
EXAMPLES = os.path.join(HERE, "data", "examples.db")
STATE = os.path.join(HERE, "data", "uploaded.json")
SIZE_LIMIT_MB = 350
MAX_SQL_BYTES = 250_000


def run_sql(sql):
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
        f.write(sql)
        path = f.name
    try:
        out = subprocess.run(["supabase", "db", "query", "--linked", "-f", path],
                             cwd=REPO, capture_output=True, text=True, timeout=300)
    finally:
        os.unlink(path)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[-500:])
    start = out.stdout.find("{")
    return json.loads(out.stdout[start:]).get("rows", []) if start >= 0 else []


def q(s):
    return "'" + str(s or "").replace("\x00", "").replace("'", "''") + "'"


def run_batched(head, tuples, tail=";"):
    """INSERT/DELETE in statements of at most MAX_SQL_BYTES."""
    batch, size = [], 0
    for t in tuples:
        batch.append(t); size += len(t) + 2
        if size >= MAX_SQL_BYTES:
            run_sql(head + ",\n".join(batch) + tail); batch, size = [], 0
    if batch:
        run_sql(head + ",\n".join(batch) + tail)


def db_size_mb():
    return int(run_sql("select pg_database_size(current_database()) as b;")[0]["b"]) / 1_048_576


def main():
    state = json.load(open(STATE)) if os.path.exists(STATE) else {"episodes": [], "lines": [], "examples": []}
    ex = sqlite3.connect(EXAMPLES)
    ex.execute(f"ATTACH '{CORPUS}' AS c")
    lines = {i: (ep, s, e, t) for i, ep, s, e, t in ex.execute("SELECT id, episode_id, start, end, text FROM lines")}
    examples = {(l, i): r for l, i, r in ex.execute("SELECT lemma, line_id, rank FROM examples")}
    episodes = {r[0]: r[1:] for r in ex.execute(
        "SELECT id, show, kind, title, published, audio_url, link FROM c.episodes "
        "WHERE id IN (SELECT DISTINCT episode_id FROM lines)")}

    old_lines = set(state["lines"])
    old_examples = {(l, i): r for l, i, r in state["examples"]}
    old_episodes = set(state["episodes"])

    gone_ex = [k for k in old_examples if k not in examples]
    new_ex = [k for k, r in examples.items() if old_examples.get(k) != r]
    gone_lines = [i for i in old_lines if i not in lines]
    new_lines = [i for i in lines if i not in old_lines]
    new_eps = [i for i in episodes if i not in old_episodes]
    print(f"examples +{len(new_ex)} −{len(gone_ex)} · lines +{len(new_lines)} −{len(gone_lines)} · episodes +{len(new_eps)}")
    if not (gone_ex or new_ex or gone_lines or new_lines or new_eps):
        print("Already in sync."); return

    size = db_size_mb()
    if new_lines and size >= SIZE_LIMIT_MB:
        print(f"! Database at {size:.0f} MB — over the {SIZE_LIMIT_MB} MB safety limit; not uploading."); return

    if gone_ex:
        run_batched("delete from public.podcast_examples where (lemma, line_id) in (values ",
                    [f"({q(l)}, {i})" for l, i in gone_ex], ");")
    if gone_lines:
        run_batched("delete from public.podcast_lines where id in (", [str(i) for i in gone_lines], ");")
    if new_eps:
        run_batched("insert into public.podcast_episodes (id, show, kind, title, published, audio_url, link) values ",
                    [f"({i}, {q(sh)}, {q(k)}, {q(t)}, {q(p)}, {q(u)}, {q(lk)})"
                     for i, (sh, k, t, p, u, lk) in episodes.items() if i in new_eps],
                    " on conflict (id) do nothing;")
    if new_lines:
        run_batched("insert into public.podcast_lines (id, episode_id, start_s, end_s, text) values ",
                    [f"({i}, {lines[i][0]}, {lines[i][1]:.2f}, {lines[i][2]:.2f}, {q(lines[i][3])})" for i in new_lines],
                    " on conflict (id) do nothing;")
    if new_ex:
        run_batched("insert into public.podcast_examples (lemma, line_id, rank) values ",
                    [f"({q(l)}, {i}, {examples[(l, i)]})" for l, i in new_ex],
                    " on conflict (lemma, line_id) do update set rank = excluded.rank;")
    # Episodes no longer referenced by any line.
    run_sql("delete from public.podcast_episodes e where not exists "
            "(select 1 from public.podcast_lines l where l.episode_id = e.id);")

    json.dump({"episodes": sorted(episodes), "lines": sorted(lines),
               "examples": [[l, i, r] for (l, i), r in examples.items()]}, open(STATE, "w"))
    print(f"Synced. Database now {db_size_mb():.0f} MB.")


if __name__ == "__main__":
    main()
