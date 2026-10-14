#!/bin/zsh
# Backfill the corpus in rounds so coverage grows evenly across shows:
# every everyday show gets 5 more episodes per round up to 50, work shows up to 10.
# Already-indexed episodes are skipped, so this is safe to stop and re-run.
# Log: data/backfill.log
cd "$(dirname "$0")"
mkdir -p data
for n in 5 10 15 20 25 30 35 40 45 50; do
  echo "=== round: $n per everyday show — $(date)"
  python3 ingest.py --kind everyday --per-show $n
  if [ $n -le 10 ]; then python3 ingest.py --kind work --per-show $n; fi
done
echo "=== backfill done — $(date)"
sqlite3 data/corpus.db "select show, count(*), round(sum(duration)/3600.0,1) || 'h' from episodes group by show;"
