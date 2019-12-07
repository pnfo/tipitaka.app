"use strict"

/**
 *  determines how to access the sqlite dbs (through webview in android or read sqlite files in node)
 *  make sure to change this to true and uncomment two requires below when compiling the android app
 */
const isAndroid = false; 
let DictionaryQuery, FTSQuery;
if (isAndroid) { // run the query locally or on the server
    console.log('Android is on');
    //FTSQuery = require('../misc/server/fts-server.js');
    //DictionaryQuery = require('../misc/server/dict-server.js');
} else {
    const TipitakaServerURLEndpoint = './tipitaka-query/'; // https://tipitaka.app/nodejs/
    DictionaryQuery = FTSQuery = class {
        constructor(query) {
            this.query = query;
        }
        async runQuery() {
            return await $.post(TipitakaServerURLEndpoint, JSON.stringify(this.query));
        }
    }
}
/**
 * FTSQuery and result sets - interface with the client
 */
const TipitakaQueryType = Object.freeze({
    FTS: 'fts',
    DICT: 'dict',
    TOKEN: 'token', // for future
});

module.exports = { FTSQuery, DictionaryQuery, isAndroid, TipitakaQueryType };