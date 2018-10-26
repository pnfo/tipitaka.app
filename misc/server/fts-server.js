"use strict";

//var restify = require('restify');
//const FR = require('./fts-runner.js');
import restify from 'restify';
import {FTSQuery, ftsRunner} from './fts-runner.mjs';

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
}*/
async function postRespond(req, res, next) {
    console.log(`Received request with query ${req.body}`);

    let jsonRes;
    try {
        const query = new FTSQuery(JSON.parse(req.body));
        query.checkQuery(); // will throw on error
        const ms = await ftsRunner.runQuery(query);
        jsonRes = { query: ms.query, wordInfo: ms.wordInfo, matches: ms.matches, stats: ms.stats };
    } catch (err) {
        console.error(`Sending error response: ${err}`);
        jsonRes = { error: err.message };
    }
    res.send(jsonRes);
    next();
}

var server = restify.createServer();
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
});

// wait for init data and then register routes
new FTSQuery({type: 'init-data'}).send().then(res => {
    //server.get('/fts-query/', respond);
    server.post('/fts-query/', postRespond);
    //server.head('/fts-query/:query', respond);
});
