#!/usr/bin/env bash
# Deploys a release to the droplet (manual step after the release workflow):
#   scripts/deploy.sh <linux amd64 binary>        (artifact desktop-ubuntu-latest of the release workflow)
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
BIN=${1:?usage: scripts/deploy.sh <linux amd64 binary>}
[ -f db/text.db ] && [ -f db/dict.db ] || { echo "build the dbs first (npm run build:data && npm run build:dict)"; exit 1; }
# always a fresh web build: an old web/dist would not match the binary and the dbs
npm run build:web
TS=$(date +%Y%m%d-%H%M%S)
TEXT="text-$(node -p "require('./db/build-info.json').content_hash").db"
DICT="dict-$(shasum db/dict.db | cut -c1-12).db"
REL="$BASE/releases/$TS"
ssh "$HOST" "mkdir -p $BASE/db $REL/db && df -h ~ | tail -1"
for pair in "db/text.db:$TEXT" "db/dict.db:$DICT"; do
  src=${pair%%:*}; dst=${pair##*:}
  if ssh "$HOST" "test -f $BASE/db/$dst"; then echo "$dst already on the server"
  else rsync -az --info=progress2 "$src" "$HOST:$BASE/db/$dst.part" && ssh "$HOST" "mv $BASE/db/$dst.part $BASE/db/$dst"; fi
done
rsync -az --info=progress2 web/dist/ "$HOST:$REL/dist/"
rsync -az "$BIN" "$HOST:$REL/tipitaka_app"
PREV=$(ssh "$HOST" "readlink $BASE/current || true")
# the first v3 deploy: the installed unit still starts the v2 binary - install server/tipitaka_app.service (runs current/)
if ! ssh "$HOST" "systemctl cat tipitaka_app.service 2>/dev/null | grep -q 'current/tipitaka_app'"; then
  echo "installing the v3 systemd unit (server/tipitaka_app.service)"
  rsync -az server/tipitaka_app.service "$HOST:/tmp/tipitaka_app.service"
  ssh -t "$HOST" "sudo cp /tmp/tipitaka_app.service /etc/systemd/system/tipitaka_app.service && sudo systemctl daemon-reload"
fi
# (-t: sudo asks for the password on the droplet)
ssh -t "$HOST" "cd $REL && chmod +x tipitaka_app && ln -sfn ../../../db/$TEXT db/text.db && ln -sfn ../../../db/$DICT db/dict.db \
  && cd ~/$BASE && ln -sfn releases/$TS current.new && mv -T current.new current && sudo systemctl restart tipitaka_app"
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
