#!/bin/zsh
# Grow the "Heard in podcasts" library until it stops paying off.
# Each round adds 5 episodes per everyday show (sampled across the whole archive, since
# recency doesn't matter for word examples) and tops work shows up to 10, then rebuilds the
# example library, syncs it to Supabase and measures notebook coverage. Stops when a round
# adds less than MIN_GAIN percentage points of coverage, or after MAX_ROUNDS.
# Safe to stop and re-run. Log: data/backfill.log
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:$PATH"
cd "$(dirname "$0")"
MIN_GAIN=1.0
MAX_ROUNDS=10
coverage() { python3 -c "import json; print(json.load(open('data/coverage.json'))['coverage'])"; }

.venv/bin/python build_examples.py --phrases-from-notebook
prev=$(coverage)
echo "=== start: coverage $prev% — $(date)"
for round in $(seq 1 $MAX_ROUNDS); do
  echo "=== round $round — $(date)"
  python3 ingest.py --kind everyday --spread --add 5
  python3 ingest.py --kind work --spread --per-show 10
  .venv/bin/python build_examples.py --phrases-from-notebook
  python3 sync_examples.py
  now=$(coverage)
  gain=$(python3 -c "print(round($now - $prev, 2))")
  echo "=== round $round: coverage $now% (+$gain)"
  if python3 -c "import sys; sys.exit(0 if $gain < $MIN_GAIN else 1)"; then
    echo "=== stopping: gain below $MIN_GAIN pt — more episodes add little now"
    break
  fi
  prev=$now
done
echo "=== backfill done — $(date)"
