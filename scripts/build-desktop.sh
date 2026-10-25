#!/usr/bin/env bash
# Builds the Windows desktop app (Wails, server/desktop.go) for the Microsoft Store, on this Mac:
#   scripts/build-desktop.sh windows   -> release/tipitaka_app-<version>.msix (unsigned: the Store signs it)
# The Mac App Store app is built by scripts/build-apple.sh (Xcode signs and uploads it).
# The version is package.json's (VERSION=x.y.z overrides it); every store upload needs a higher one.
# Microsoft Store: the Product identity values of the app in Partner Center (MSIX_NAME, MSIX_PUBLISHER and
#   MSIX_PUBLISHER_DISPLAY override them).
# Tools: brew install mingw-w64 cmake; makemsix from github.com/microsoft/msix-packaging (makemac.sh --pack),
#   expected in ~/.local/opt/msix/bin (MAKEMSIX=path overrides).
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=${VERSION:-$(node -p "require('./package.json').version")}
ICONS=server/packaging/icons # scripts/make-icons.mjs
OUT=release
[ -f db/text.db ] && [ -f db/dict.db ] || { echo "build the dbs first (npm run build:data && npm run build:dict)"; exit 1; }
node scripts/check-converter.mjs
npm run -s build:web # a fresh web build: an old web/dist would not match the binary and the dbs
mkdir -p "$OUT"

windows() {
  local name=${MSIX_NAME:-PathNirvanaFoundation.Tipitaka.app} publisher=${MSIX_PUBLISHER:-CN=BC7CD46E-BF3E-4587-BEED-608011FA908B}
  local publisher_display=${MSIX_PUBLISHER_DISPLAY:-Path Nirvana Foundation}
  local makemsix=${MAKEMSIX:-$HOME/.local/opt/msix/bin/makemsix} dir="$OUT/windows"
  [ -x "$makemsix" ] || { echo "makemsix not found at $makemsix"; exit 1; }
  rm -rf "$dir" && mkdir -p "$dir/db" "$dir/Assets"
  # icon and manifest (per monitor dpi, common controls v6) of the exe; the .syso is only used by windows builds
  (cd server && go run github.com/tc-hib/go-winres@v0.3.3 simply --arch amd64 --out rsrc --icon "../$ICONS/windows/app.ico" \
    --manifest gui --product-name Tipitaka.app --file-description Tipitaka.app --original-filename tipitaka_app.exe \
    --product-version "$VERSION.0" --file-version "$VERSION.0")
  trap 'rm -f server/rsrc_windows_amd64.syso' RETURN
  (cd server && CGO_ENABLED=1 GOOS=windows GOARCH=amd64 CC=x86_64-w64-mingw32-gcc \
    go build -tags desktop,production -trimpath -ldflags "-s -w -H windowsgui" -o "../$dir/tipitaka_app.exe" .)
  cp "$ICONS"/windows/*.png "$dir/Assets/"
  sed -e "s|__IDENTITY_NAME__|$name|" -e "s|__PUBLISHER__|$publisher|" \
    -e "s|__PUBLISHER_DISPLAY__|$publisher_display|" -e "s|__VERSION__|$VERSION|" \
    server/packaging/windows/AppxManifest.xml > "$dir/AppxManifest.xml"
  cp -R web/dist "$dir/dist"
  cp db/text.db db/dict.db "$dir/db/"
  rm -f "$OUT/tipitaka_app-$VERSION.msix"
  "$makemsix" pack -d "$dir" -p "$OUT/tipitaka_app-$VERSION.msix"
  ls -lh "$OUT/tipitaka_app-$VERSION.msix"
}

case "${1:-}" in
  windows) windows ;;
  *) echo "usage: $0 windows"; exit 1 ;;
esac
