# tipitaka.app

## Bulding Apps for Windows, Mac and Linux
### How to make an executable from the server

### Windows
`rm tipitaka-app.exe; npx pkg -t win --output tipitaka-app.exe tipitaka-app.js` for 32 bit windows use `win-x86`

### Mac
`npx pkg -t macos --output tipitaka-app-mac tipitaka-app.js`

### Linux
For linux need to build it on a linux/ubuntu machine

`npx pkg -t linux --output tipitaka-app-linux tipitaka-app.js`

### Run in Website
Same linux binary is run in the webserver https://tipitaka.app to serve requests from the online website

1. `pm2 start ./tipitaka-app-linux` (run in pm2 at tipitaka.app)
2. `git clone` the github repository
3. copy the `static/db/dict-all.db` (this is not included in the repository since the big size)

### Run locally for debugging
`node tipitaka-app.js`

### Pre-built Node binaries
These need to be placed in the same diretory of the exe created above

get a copy of the required pre built native modules - e.g. **sqlite3**

`./node_modules/.bin/node-pre-gyp install --directory=./node_modules/sqlite3 --target_platform=linux` (win32 or darwin) add `--target_arch=ia32` for 32 bit

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
   2. `constants.js` change isAndroid