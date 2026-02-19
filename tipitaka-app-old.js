"use strict";

// rm tipitaka-app.exe; npx pkg -t win --output tipitaka-app.exe tipitaka-app.js
// npx pkg -t macos --output tipitaka-app-mac tipitaka-app.js

// for linux need to compile on a ubuntu box
// npx pkg -t linux --output tipitaka-app-linux tipitaka-app.js

// run the linux binary in production using pm2 at https://tipitaka.app
// pm2 start tipitaka-app.js (run in pm2 at tipitaka.app)
// note: you may have to install some dependencies locally in the server

// run locally for debugging
// node tipitaka-app.js

// get a copy of the required pre built native modules - sqlite3
//./node_modules/.bin/node-pre-gyp install --directory=./node_modules/sqlite3 --target_platform=linux win32 or darwin
// downloaded to ./node_modules/sqlite3/lib/binding

// const restify = require('restify');
// const colors = require('colors');
// const path = require('path');
// const fs = require('fs');
import restify from 'restify';
import colors from 'colors';
import path from 'path';
import fs from 'fs';
import { TipitakaQueryType } from './misc/server/constants.js';
import { SqliteDB } from './misc/server/sql-query.js';
import { FTSQuery } from './misc/server/fts-server.js';
import { DictionaryQuery } from './misc/server/dict-server.js';
//const TipitakaQueryType = require('./misc/server/constants.js').TipitakaQueryType;
//const SqliteDB = require('./misc/server/sql-query.js');
//const FTSQuery = require('./misc/server/fts-server.js');
//const DictionaryQuery = require('./misc/server/dict-server.js');

// this gives the script directory or the binary directory in both of the cases above
const checkDirList = [process.cwd(), path.dirname(process.execPath), path.dirname(process.argv[1])]
function checkDir(dir) {
    // console.log(`Testing directory ${dir}`);
    if (fs.existsSync(path.join(dir, 'dist', 'index.html'))) {
        console.log(`Found dist/index.html in ${dir}`);
        return path.join(dir, 'dist');
    }
    if (fs.existsSync(path.join(dir, 'index.html'))) {
        console.log(`Found index.html in ${dir}`);
        return dir;
    }
    return null;
}
let dirname = null;
for (const dir of checkDirList) {
    dirname = checkDir(dir);
    if (dirname) break;
}
if (!dirname) dirname = process.cwd(); // fallback
if (path.basename(dirname) === 'dist') {
    SqliteDB.setRootFolder(dirname);
} else {
    SqliteDB.setRootFolder(path.join(dirname, 'public')); // in dev mode, db files are in public
}

//SqliteDB.setRootFolder(dirname); // on macos absolute path to the db file is needed to open them
console.log(colors.yellow(`Serving static files from ${dirname}`));


async function postRespond(req, res) {
    console.log(`Received request with query ${req.body}`);

    const query = JSON.parse(req.body);
    let tQuery;
    if (query.type == TipitakaQueryType.FTS) {
        tQuery = new FTSQuery(query);
    } else if (query.type == TipitakaQueryType.DICT) {
        tQuery = new DictionaryQuery(query);
    } else {
        res.send(500, { error: `Unhandled query type ${query.type}` });
        return;
    }
    const jsonRes = await tQuery.runQuery();
    res.send(jsonRes);
    //next();
}

function startRestify() {
    const server = restify.createServer();
    server.use( // allows to access from any server - consider removing in prod
        function crossOrigin(req, res, next) {
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", "X-Requested-With");
            return next();
        }
    );
    server.use(restify.plugins.jsonBodyParser()); // parse the body of post request
    server.use(restify.plugins.gzipResponse());
    server.listen(8080, function () {
        console.log('%s listening at %s', server.name, server.url);
        console.log(colors.green('Open this URL in your browser \nhttp://127.0.0.1:8080/'));
    });

    // register routes
    server.post('/tipitaka-query/', postRespond);

    server.get('/*', restify.plugins.serveStatic({
        directory: dirname,
        default: 'index.html',
        //appendRequestPath: false,
    }));
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function start() {
    // opens the browser with the local url
    console.log(`Running on platform ${process.platform}`);
    if (process.platform == 'win32' || process.platform == 'darwin') { // in linux this results in an error
        //const open = require('open');
        //await open('http://127.0.0.1:8080/');  // uncomment when building offline apps
    }

    await sleep(1000); // make sure the open finishes even if startRestify fails because the server is already running
    startRestify();
}

start();