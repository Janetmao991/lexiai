#!/bin/zsh
# Daily (launchd: com.janet.lexiai-podcast, at login and 13:00): add one archive episode per everyday show,
# rebuild the example library (also picks up phrases newly saved to the notebook) and
# sync the changes to Supabase. While backfill.sh runs it owns transcription and syncing.
# Log: data/nightly.log
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:$PATH"
cd "$(dirname "$0")"
echo "=== nightly — $(date)"
if pgrep -f "backfill.sh" > /dev/null; then
  echo "backfill running — nothing to do"
  exit 0
fi
# The initial backfill resumes here until it finishes (the Mac is often off overnight).
if [ ! -f data/backfill.done ]; then
  echo "backfill not finished — resuming it"
  exec caffeinate -i ./backfill.sh
fi
caffeinate -i python3 ingest.py --kind everyday --spread --add 1
.venv/bin/python build_examples.py --phrases-from-notebook
python3 sync_examples.py
