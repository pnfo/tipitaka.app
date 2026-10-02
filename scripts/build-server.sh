#!/usr/bin/env bash
# builds server/bin/tipitaka_app for this machine (cgo sqlite)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f scripts/go-env.sh ] && source scripts/go-env.sh
node scripts/sync-converter.mjs --check
cd server && go build -trimpath -ldflags "-s -w" -o bin/tipitaka_app .
echo "built server/bin/tipitaka_app"
