#!/usr/bin/env bash
# Builds the desktop app zip for the CURRENT platform (cgo sqlite => built natively on each OS by
# .github/workflows/release.yml).   scripts/release-desktop.sh -> release/tipitaka_app_<os>_<arch>.zip
set -euo pipefail
cd "$(dirname "$0")/.."
OS=$(go env GOOS); ARCH=$(go env GOARCH)
NAME="tipitaka_app_${OS}_${ARCH}"
[ -f db/text.db ] || npm run build:data
[ -f web/dist/index.html ] || npm run build:web
EXT=""; [ "$OS" = "windows" ] && EXT=".exe"
OUT="release/$NAME"
rm -rf "$OUT" && mkdir -p "$OUT/db"
[ "$OS" = darwin ] && [ -f scripts/go-env.sh ] && source scripts/go-env.sh
(cd server && CGO_ENABLED=1 go build -trimpath -ldflags "-s -w" -o "../$OUT/tipitaka_app$EXT" .)
cp -R web/dist "$OUT/dist"
cp db/text.db "$OUT/db/"
[ -f db/dict.db ] && cp db/dict.db "$OUT/db/"
cat > "$OUT/README.txt" <<TXT
Tipiṭaka.app offline app. Run tipitaka_app$EXT - it opens http://localhost:8402 in your browser.
Texts: Vipassana Research Institute (CST). Dictionary: Digital Pāḷi Dictionary (CC BY-NC-SA 4.0) and others.
TXT
(cd release && rm -f "$NAME.zip" && if command -v zip >/dev/null; then zip -qr "$NAME.zip" "$NAME"; else powershell -Command "Compress-Archive -Path '$NAME' -DestinationPath '$NAME.zip'"; fi)
echo "built release/$NAME.zip"
# macOS signing/notarization: server/sign-notorize.sh
