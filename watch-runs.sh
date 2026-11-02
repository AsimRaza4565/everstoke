export GH_TOKEN=$(grep '^GITHUB_PAT=' "C:/Users/Revnix/Documents/youtube-automation/.env" | cut -d= -f2 | tr -d '\r')
cd "C:/Users/Revnix/Documents/youtube-automation"
echo "=== WATCHING ALL WORKFLOWS (max 100 min) — started $(date -u) ==="
for i in $(seq 1 100); do
  OUT=$(gh run list --repo muzzamilhassan/automation --limit 8 2>/dev/null)
  BUSY=$(echo "$OUT" | grep -cE "in_progress|queued|startup_failure")
  echo "--- poll $i ($(date -u +%H:%M)) — active runs: $BUSY"
  echo "$OUT" | head -8
  if [ "$BUSY" = "0" ]; then echo "ALL RUNS SETTLED"; break; fi
  sleep 60
done
echo ""
echo "=== FINAL STATUS ==="
gh run list --repo muzzamilhassan/automation --limit 8
