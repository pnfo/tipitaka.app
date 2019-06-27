"use strict";

// how to make an executable from the server
// npx rollup tipitaka-app.mjs --file tipitaka-app.js --format cjs
// rollup is needed since pkg does not support new ES Modules yet

// rm tipitaka-app.exe; npx pkg -t win --output tipitaka-app.exe tipitaka-app.js
// npx pkg -t macos --output tipitaka-app-mac tipitaka-app.js

// for linux need to pass in a special param since open does not work in linux
// npx pkg -t linux --output tipitaka-app-linux tipitaka-app.js
// pm2 start ./tipitaka-app-linux -- --no-open (run in pm2 at tipitaka.app)

// run locally for debugging
// node --experimental-modules tipitaka-app.mjs --no-open

// get a copy of the required pre built native modules - sqlite3
//./node_modules/.bin/node-pre-gyp install --directory=./node_modules/sqlite3 --target_platform=linux win32 or darwin
// downloaded to ./node_modules/sqlite3/lib/binding

import restify from 'restify';
import open from 'open';
import colors from 'colors';
import path from 'path';
import fs from 'fs';
import { TipitakaQueryType } from './misc/server/sql-query.mjs';
import { FTSQuery } from './misc/server/fts-server.mjs';
import { DictionaryQuery } from './misc/server/dict-server.mjs';
import { SqliteDB } from './misc/server/sql-query.mjs';

// this gives the script directory or the binary directory in both of the cases above
const checkDirList = [process.cwd(), path.dirname(process.execPath), path.dirname(process.argv[1])]
function checkDir(dir, ind) {
    console.log(`Testing directory ${ind}:${dir}`);
    if (fs.existsSync(path.join(dir, 'index.html'))) {
        console.log(`Found index.html in ${ind}:${dir}`);
        return true;
    }
    return false;
}
const dirname = checkDirList.find(checkDir);
SqliteDB.setRootFolder(dirname); // on macos absolute path to the db file is needed to open them
console.log(colors.yellow(`Serving static files from ${dirname}`));


async function postRespond(req, res, next) {
    console.log(`Received request with query ${req.body}`);

    const query = JSON.parse(req.body);
    let tQuery;
    if (query.type == TipitakaQueryType.FTS) {
        tQuery = new FTSQuery(query);
    } else if (query.type == TipitakaQueryType.DICT) {
        tQuery = new DictionaryQuery(query);
    } else {
        res.send({ error: `Unhandled query type ${query.type}`});
        return;
    }
    const jsonRes = await tQuery.runQuery();
    res.send(jsonRes);
    next();
}

function startRestify() {
    const server = restify.createServer();
    server.use( // allows to access from any server - consider removing in prod
        function crossOrigin(req, res, next){
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", "X-Requested-With");
            return next();
        }
    );
    server.use(restify.plugins.jsonBodyParser()); // parse the body of post request
    server.use(restify.plugins.gzipResponse());
    server.listen(8080, function() {
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
    return new Promise(resolve => setTimeout(resolve,ms));
}

async function start() {
    // opens the browser with the local url
    if (process.argv[2] != 'no-open') { // in linux this results in an error
        await open('http://127.0.0.1:8080/');  // uncomment when building offline apps
    }
    
    await sleep(1000); // make sure the open finishes even if startRestify fails because the server is already running
    startRestify();
}

start();

/*async function respond(req, res, next) {
    console.log(`Received request with query ${req.params.query}`);

    let jsonRes;
    try {
        const queryObj = JSON.parse(decodeURIComponent(req.params.query));
        const query = new FR.FTSQuery(queryObj);
        query.checkQuery(); // will throw on error
        const ms = await FR.ftsRunner.runQuery(query);
        jsonRes = { query: ms.query, wordInfo: ms.wordInfo, matches: ms.matches };
    } catch (err) {
        jsonRes = { error: err.toString() };
    }
    //const test = {raw: 'ff'};
    res.send(jsonRes);
    //res.send('hello ' + req.params.name);
    next();
}
// wait for init data and then register routes
new FTSQuery({type: 'init-data'}).send().then(res => {
    //server.get('/fts-query/', respond);
    server.post('/fts-query/', postRespond);
    //server.head('/fts-query/:query', respond);
});

*/