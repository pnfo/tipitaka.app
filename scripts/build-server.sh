#!/usr/bin/env bash
# builds server/bin/tipitaka_app for this machine (cgo sqlite)
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/check-converter.mjs
cd server && go build -trimpath -ldflags "-s -w" -o bin/tipitaka_app .
echo "built server/bin/tipitaka_app"
