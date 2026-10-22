# Deploying

## Website (droplet `tipitaka.lk`, nginx `conf.d/tipitaka.app.conf` → 127.0.0.1:8402)
1. Build the dbs locally (`npm run build:data`, `npm run build:dict`).
2. `scripts/deploy.sh` cross-compiles the linux binary here (macOS: `brew tap messense/macos-cross-toolchains`,
   `x86_64-unknown-linux-gnu-gcc`; the binary needs glibc 2.14), builds the web app and uploads (the dbs zstd
   compressed, ~195 MB instead of ~830 MB, resumable) the dbs only when their hash is new (`~/www/tipitaka.app/db/`,
   shared by releases), the web build and the binary to `releases/<ts>`, flips `current`, restarts and waits for
   `/api/health` to report the new content hash, then prunes all but the previous release. sudo on tipitaka.lk asks
   for the password (the script uses `ssh -t` for the restart).
3. The first v3 deploy installs the v3 unit (`server/tipitaka_app.service`: it runs `current/tipitaka_app`) when the
   installed one still starts the v2 binary. After the cutover the v2 files can go:
   ```
   rm -rf ~/www/tipitaka.app/{dist,server-data,archive.tar.gz,tipitaka_app_linux_intel}
   ```
   The nginx server block stays (`proxy_pass http://localhost:8402`); the dead `location ^~ /pali` block can go.

Rollback: `ssh tipitaka.lk 'cd www/tipitaka.app && ln -sfn releases/<previous> current && sudo systemctl restart tipitaka_app'`.

**Load and uptime** (after the 2026-10-19 outage: crawlers asked for thousands of server rendered pages in non-Roman
scripts, each a goja conversion on the 1 CPU droplet; the renders piled up, nginx returned 502 and the process grew to
580 MB + 1 GB swap without crashing, so systemd never restarted it):
- The conversion is native Go since (the `server/pali-converter` submodule): ~5 ms a page instead of ~300 ms in goja
  (DN 1 in any script on an M-series CPU, `npm run bench` there), so the render slots are rarely all busy.
- `server/guard.go`: at most 4 page renders at once (more wait ≤1.5 s, then a person gets the app shell, a crawler
  503 + `Retry-After`), 3 concurrent full text searches, a 32 MB page cache. Since the converter is Go (~5 ms for DN 1
  instead of 200-400 ms in goja) this is a safety net: one Mac core renders ~270 of the longest pages a second.
- Sitemaps and hreflang links only offer the first 9 scripts of the menu (`seoScripts` in `server/static.go`); pages in
  the other 13 still render, but crawlers are not invited to 22 copies of every text.
- `/api/health` → `load` (renders, cache hits, shed requests, heap); the journal gets the counters every 10 minutes
  (`journalctl -u tipitaka_app | grep load`).
- `server/tipitaka_app.service`: `Restart=always`, `MemoryHigh=450M`/`MemoryMax=600M` (killed and restarted instead of
  swapping the shared droplet).
- `tipitaka_app_watchdog.timer` (every 2 min, root): restarts the server when `/api/health` does not answer three
  times in a row (`journalctl -t tipitaka_app_watchdog`, `systemctl list-timers tipitaka_app_watchdog`).
- deploy.sh installs the units and the watchdog whenever they differ from the droplet's.

**Statistics** (`server/stats.go`, `server/stats_page.go`, `web/src/composables/stats.ts`): anonymous daily counts in
`~/www/tipitaka.app/metrics.db` (no addresses or ids), shown at https://tipitaka.app/stats by week or month. The
password is in `~/www/tipitaka.app/stats.env` (`STATS_PASSWORD=...`, read by the unit; no file: no /stats). Countries
(and the first visit's script, `/api/country`) come from DB-IP's country lite csv in `~/www/tipitaka.app/geo/`, which
deploy.sh fetches when a new month's file is out (CC BY 4.0: credited in PRIVACY.md and on /stats). The server
counts the api calls of people and the requests of crawlers; the web app sends a beacon with the visit (new /
returning, first of the day / week / month, script, language), the pages opened and the searches (the last query of
each).

**Disk** (checked 2026-10-17): tipitaka.lk has 24 GB, 14 GB free; 1 GB RAM (+2 GB swap), 1 CPU. `~/www` is a symlink
to `/var/www/html`. The droplet is shared with tipitaka.lk (2.7 GB, of which 1.8 GB are its releases), tipitaka_lk_new,
arutha.lk and the file server. One v3 db set is ~815 MB (text 375 MB, dict 440 MB); a deploy keeps at most two sets.
The v2 files of tipitaka.app (~700 MB) can go after the cutover.

## Upstream corrections
The **sync-upstream** workflow runs daily: new tipitaka-xml commits (or a DPD release) → build + tests → a PR with
the build report (changed texts, key changes). Merge, run the release workflow, deploy.

## Desktop
The release workflow builds zips natively for linux (amd64/arm64), macOS (intel/arm) and windows
(`scripts/release-desktop.sh`). Sign/notarize macOS builds with `server/sign-notorize.sh`.

## Android / iOS
`scripts/build-mobile.sh android|ios` (also a release artifact) + `web/dist-app` + the dbs; see
`dev-docs/native-bridge.md`.

* The text db is uploaded as `text-<content_hash>.db`; the content hash covers the text and everything derived that
  goes into the db (links, the commentary alignment, the names, settings and mentions), so a new alignment or names
  run makes a new db even when the text did not change (and the clients' API cache moves on with it).
  `scripts/deploy.sh` always makes a fresh web build.
