# Deploying

## Website (droplet `pitaka.lk`, nginx → 127.0.0.1:8402)
1. Run the **release** workflow (tag `v3.x` or manually). Download the artifacts `data` (text.db, dict.db),
   `web` and `desktop-ubuntu-latest` (contains the linux `tipitaka_app`) - or build locally (dbs/web) and use the binary.
2. `scripts/deploy.sh path/to/tipitaka_app` uploads the dbs only when their hash is new (`~/www/tipitaka.app/db/`,
   shared by releases), the web build and the binary to `releases/<ts>`, flips `current`, restarts and waits for
   `/api/health` to report the new content hash, then prunes all but the previous release.
3. One time: install the new unit and remove the v2 files
   ```
   sudo cp server/tipitaka_app.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl restart tipitaka_app
   # after the cutover: rm -rf ~/www/tipitaka.app/{dist,server-data,archive.tar.gz,tipitaka_app_linux_intel}
   ```
   The nginx server block stays (`proxy_pass http://localhost:8402`); the dead `location ^~ /pali` block can go.

Rollback: `ssh pitaka.lk 'cd www/tipitaka.app && ln -sfn releases/<previous> current && sudo systemctl restart tipitaka_app'`.

**Disk:** the droplet has ~1.3 GB free and 1 GB RAM. One db set is ~750 MB; the first deploy only fits after the
v2 files (~730 MB) are removed. Resizing to ≥ 50 GB disk / 2 GB RAM is recommended before launch.

## Upstream corrections
The **sync-upstream** workflow runs daily: new tipitaka-xml commits (or a DPD release) → build + tests → a PR with
the build report (changed texts, key changes). Merge, run the release workflow, deploy.

## Desktop
The release workflow builds zips natively for linux (amd64/arm64), macOS (intel/arm) and windows
(`scripts/release-desktop.sh`). Sign/notarize macOS builds with `server/sign-notorize.sh`.

## Android / iOS
`scripts/build-mobile.sh android|ios` (also a release artifact) + `web/dist-app` + the dbs; see
`dev-docs/native-bridge.md`.
