#!/usr/bin/env bash
# Deploys a release to the droplet tipitaka.lk:
#   scripts/deploy.sh [linux amd64 binary]   without one, the binary is cross-compiled here (macOS: brew tap
#                                            messense/macos-cross-toolchains, x86_64-unknown-linux-gnu-gcc; needs glibc 2.14)
# The dbs are the local ones (db/, npm run build:data / build:dict).
# Server layout (~/www/tipitaka.app):
#   db/text-<content_hash>.db, db/dict-<hash>.db   shared by releases, only uploaded when new (disk is small)
#   releases/<ts>/{tipitaka_app, dist/, db/ -> symlinks}  and `current` -> releases/<ts>
# The systemd unit (server/tipitaka_app.service) runs current/tipitaka_app. Old releases and dbs beyond the
# previous one are pruned.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${DEPLOY_HOST:-tipitaka.lk}
BASE=${DEPLOY_BASE:-www/tipitaka.app}
SITE=${DEPLOY_SITE:-https://tipitaka.app}
BIN=${1:-}
if [ -z "$BIN" ]; then
  BIN=server/bin/tipitaka_app_linux_amd64
  echo "building $BIN"
  node scripts/check-converter.mjs
  (cd server && CGO_ENABLED=1 GOOS=linux GOARCH=amd64 CC=${LINUX_CC:-x86_64-unknown-linux-gnu-gcc} go build -trimpath -ldflags "-s -w" -o bin/tipitaka_app_linux_amd64 .)
fi
[ -f db/text.db ] && [ -f db/dict.db ] || { echo "build the dbs first (npm run build:data && npm run build:dict)"; exit 1; }
# always a fresh web build: an old web/dist would not match the binary and the dbs
npm run build:web
TS=$(date +%Y%m%d-%H%M%S)
TEXT="text-$(node -p "require('./db/build-info.json').content_hash").db"
DICT="dict-$(shasum db/dict.db | cut -c1-12).db"
REL="$BASE/releases/$TS"
ssh "$HOST" "mkdir -p $BASE/db $REL/db && df -h ~ | tail -1"
# the dbs go compressed (zstd -19 --long: text 375 -> 107 MB, dict 455 -> 87 MB; slow uplinks): compressed once into
# .cache/deploy/<name>.zst, uploaded with --partial (an interrupted upload resumes), unpacked on the server
mkdir -p .cache/deploy
for pair in "db/text.db:$TEXT" "db/dict.db:$DICT"; do
  src=${pair%%:*}; dst=${pair##*:}
  if ssh "$HOST" "test -f $BASE/db/$dst"; then echo "$dst already on the server"; continue; fi
  zst=.cache/deploy/$dst.zst
  if [ ! -f "$zst" ]; then
    echo "compressing $src"
    zstd -q -f -T0 -19 --long=27 "$src" -o "$zst.tmp" && mv "$zst.tmp" "$zst"
  fi
  rsync --partial --info=progress2 "$zst" "$HOST:$BASE/db/$dst.zst"
  ssh "$HOST" "cd $BASE/db && zstd -q -d -f --long=27 $dst.zst -o $dst.part && mv $dst.part $dst && rm -f $dst.zst"
done
# (compressed dbs of older builds)
find .cache/deploy -name '*.db.zst' ! -name "$TEXT.zst" ! -name "$DICT.zst" -delete
rsync -az --info=progress2 web/dist/ "$HOST:$REL/dist/"
rsync -az "$BIN" "$HOST:$REL/tipitaka_app"
PREV=$(ssh "$HOST" "readlink $BASE/current || true")
# the systemd units (server/tipitaka_app.service, the watchdog): installed when they differ from the droplet's
rsync -az server/tipitaka_app.service server/tipitaka_app_watchdog.{service,timer,sh} "$HOST:$REL/systemd/"
UNITS="cd ~/$REL/systemd && same=1; cmp -s tipitaka_app_watchdog.sh /usr/local/bin/tipitaka_app_watchdog || same=; \
  for f in *.service *.timer; do cmp -s \$f /etc/systemd/system/\$f || same=; done; [ -n \"\$same\" ] || { echo 'installing the systemd units' \
  && sudo install -m 644 *.service *.timer /etc/systemd/system/ && sudo install -m 755 tipitaka_app_watchdog.sh /usr/local/bin/tipitaka_app_watchdog \
  && sudo systemctl daemon-reload && sudo systemctl enable --now tipitaka_app_watchdog.timer; }"
# (-t: sudo asks for the password on the droplet, once)
ssh -t "$HOST" "cd $REL && chmod +x tipitaka_app && ln -sfn ../../../db/$TEXT db/text.db && ln -sfn ../../../db/$DICT db/dict.db \
  && cd ~/$BASE && ln -sfn releases/$TS current.new && mv -T current.new current && ($UNITS) && sudo systemctl restart tipitaka_app"
EXPECTED=$(node -p "require('./db/build-info.json').content_hash")
for i in $(seq 1 20); do
  if curl -fsS "$SITE/api/health" 2>/dev/null | grep -q "\"contentHash\":\"$EXPECTED\""; then
    echo "deployed $TS ($EXPECTED)"
    # keep the current and the previous release and the dbs they use
    ssh "$HOST" "cd ~/$BASE && ls -1d releases/* | head -n -2 | xargs -r rm -rf && \
      used=\$(readlink -f releases/*/db/*.db | xargs -n1 basename | sort -u) && \
      for f in db/*.db; do echo \"\$used\" | grep -qx \"\$(basename \$f)\" || rm -f \"\$f\"; done && df -h ~ | tail -1"
    exit 0
  fi
  sleep 2
done
echo "health check failed. rollback: ssh $HOST 'cd $BASE && ln -sfn ${PREV#$HOME/} current && sudo systemctl restart tipitaka_app'"
exit 1
