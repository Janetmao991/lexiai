#!/bin/zsh
# Rebuild the LOCAL LexiAI (bilingual, GLOSS_LANG from .env.local) and restart the
# background service. Run after `git pull` or any code change:
#   ~/Desktop/Claude-cowork/lexiai/scripts/rebuild-local.sh
set -e
export PATH="/Users/maoqing/.nvm/versions/node/v22.22.1/bin:$PATH"
cd /Users/maoqing/Desktop/Claude-cowork/lexiai
echo "▸ building local bundle (GLOSS_LANG=$(grep -o 'GLOSS_LANG=.*' .env.local | cut -d= -f2))…"
npm run build --silent 2>&1 | grep -E "built in|error" || true
echo "▸ restarting service…"
launchctl kickstart -k gui/$(id -u)/com.janet.lexiai-local
sleep 2
if curl -s -o /dev/null -w "%{http_code}" http://localhost:5181 | grep -q 200; then
  echo "✓ LexiAI local is up: http://localhost:5181"
else
  echo "✗ not responding — check /tmp/lexiai-local.log"; exit 1
fi
