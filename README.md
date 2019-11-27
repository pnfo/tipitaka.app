# tipitaka.app

## Bulding Apps for Windows, Mac and Linux
### How to make an executable from the server

`npx rollup tipitaka-app.mjs --file tipitaka-app.js --format cjs`

rollup is needed since pkg does not support new ES Modules yet

### Windows
`rm tipitaka-app.exe; npx pkg -t win --output tipitaka-app.exe tipitaka-app.js`

### Mac
`npx pkg -t macos --output tipitaka-app-mac tipitaka-app.js`

### Linux
For linux need to pass in a special param since open does not work in linux

`npx pkg -t linux --output tipitaka-app-linux tipitaka-app.js`

### Run in Website
Same linux binary is run in the webserver https://tipitaka.app to serve requests from the online website

`pm2 start ./tipitaka-app-linux -- no-open` (run in pm2 at tipitaka.app)

### Run locally for debugging
`node --experimental-modules tipitaka-app.mjs no-open`

### Pre-built Node binaries
These need to be placed in the same diretory of the exe created above

get a copy of the required pre built native modules - e.g. **sqlite3**

`./node_modules/.bin/node-pre-gyp install --directory=./node_modules/sqlite3 --target_platform=linux` (win32 or darwin)

downloaded to `./node_modules/sqlite3/lib/binding`

### Following files need to be bundled with the EXE
* `/misc`
* `/static`
* `index.html`
* `node_sqlite3.node` specific to the platform
* the exe generated above

## Building Apps for Android
1. following files need to be placed in the assets folder
   * `/misc`
   * `/static`
   * `index.html`
2. Changes are needed in the following files to make sure that fts and dict requests are handled inside the app and db requests are sent to the Android Java runtime
   1. `sql-query.mjs` disable node imports
   2. `fts-client.js` import fts-server.mjs
   3. `dict-client.js` import dict-server.mjs