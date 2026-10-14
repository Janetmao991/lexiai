#!/bin/zsh
# Nightly (launchd: com.janet.lexiai-podcast): pick up new episodes, then upload to Supabase.
# While backfill.sh is still running it owns transcription, so only the upload runs.
# Log: data/nightly.log
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:$PATH"
cd "$(dirname "$0")"
echo "=== nightly — $(date)"
if pgrep -f "podcast/backfill.sh|\./backfill.sh" > /dev/null; then
  echo "backfill still running — skipping transcription"
else
  caffeinate -i python3 ingest.py --kind everyday --per-show 3
  caffeinate -i python3 ingest.py --kind work --per-show 2
fi
python3 sync_supabase.py
