# scrub-history.ps1 — run this ONCE, from the repo root, when you're ready.
# Purpose: purge ~600MB of dead media + the leaked password/secret values from
# ALL git history (issue #92 follow-up / cleanup audit "option 3"), then
# force-push main. Backed up beforehand: youtube-automation-history-backup.bundle
#
# WHAT IT DOES:
#   1. Verifies the backup bundle exists (rollback = clone from it)
#   2. Runs git filter-repo: removes the purge-list paths from every commit,
#      redacts leaked secret VALUES (JWT_SECRET / N8N_ENCRYPTION_KEY /
#      POSTIZ_* lines that were committed in old .env.example versions)
#   3. Re-adds the origin remote (filter-repo removes remotes as a safety)
#   4. Force-pushes main
#   5. Garbage-collects locally so the space is actually freed
#
# WHAT YOU SHOULD KNOW:
#   - ALL commit SHAs change (history rewrite). Issue comments that reference
#     old SHAs keep their text but the links go stale.
#   - Any CI state commit that lands while this runs is dropped (harmless —
#     the sweeper heals; state re-commits next run).
#   - The working tree at HEAD is unchanged (same files, same content).
#   - GitHub may serve cached history for a while; full purge on their side
#     needs a support ticket (or just wait for their GC).
#
# Run:  powershell -ExecutionPolicy Bypass -File scripts\scrub-history.ps1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

# 0. preconditions
if (-not (Test-Path 'C:\Users\Revnix\Documents\youtube-automation-history-backup.bundle')) {
  Write-Error 'backup bundle missing — create it first: git bundle create ..\backup.bundle --all'
  exit 1
}
if (-not (Test-Path 'scripts/scrub-replace-text.txt')) {
  Write-Error 'replace-text file missing (scripts/scrub-replace-text.txt)'
  exit 1
}
$remoteUrl = git remote get-url github-personal
Write-Host "backup OK · remote: $remoteUrl · HEAD: $(git rev-parse --short HEAD)"

# 1. rewrite history
python -m git_filter_repo --force --invert-paths `
  --path fb-outbox `
  --path explainer/public/psych-music.mp3 `
  --path-glob "demos/*.mp4" `
  --path old-style-sw-1.mp4 --path old-style-sw-2.mp4 `
  --path own-music/tracks `
  --path pixabay-themes `
  --path yt-compilation-test.mp4 --path yt-test-script-short.mp4 `
  --path hf-out/IronDaily-mv6zat2w --path hf-out/studio-test-3 `
  --path studio/render-test --path studio/render-clean.jpg --path studio/render-v5-premium.jpg `
  --path studio/login-payload.json `
  --path auth-url.txt `
  --path ccm-assets.js --path ccm-blend.js --path ccm-config.js --path ccm-decode.js `
  --path ccm-done.js --path ccm-parse.js --path ccm-qcparse.js --path ccm-reject.js `
  --path ccm-save.js --path ccm-strategy.js `
  --path docker-compose.yml --path n8n.Dockerfile --path preview-posters.html `
  --path thumbnails/tests `
  --replace-text scripts/scrub-replace-text.txt

# 2. restore the remote (filter-repo removes it)
git remote remove github-personal 2>$null
git remote add github-personal $remoteUrl

# 3. force-push
git push --force origin main

# 4. local GC — actually frees the 2.2GB
git reflog expire --expire=now --all
git gc --prune=now --aggressive

Write-Host ''
Write-Host 'DONE. Repo rewritten + force-pushed. New size:'
(git count-objects -vH | Select-String 'size-pack')
Write-Host 'Next: verify https://github.com/muzzamilhassan/automation (files identical at HEAD), then delete youtube-automation-history-backup.bundle when satisfied.'
