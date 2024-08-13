"use strict"
// try to move the code that needs to be changed when compiling for node/web/android

/**
 *  determines how to access the sqlite dbs (through webview in android or read sqlite files in node)
 *  make sure to change this to true and uncomment two requires below when compiling the android app
 */
export const isAndroid = false; 
export let DictionaryQuery, FTSQuery;
if (isAndroid) { // run the query locally or on the server
    console.log('Android is on');
    //FTSQuery = require('../misc/server/fts-server.js');
    //DictionaryQuery = require('../misc/server/dict-server.js');
    import('../misc/server/fts-server.js').then(module => FTSQuery = module.FTSQuery)
    import('../misc/server/dict-server.js').then(module => DictionaryQuery = module.DictionaryQuery)
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
export const TipitakaQueryType = Object.freeze({
    FTS: 'fts',
    DICT: 'dict',
    TOKEN: 'token', // for future
});

//module.exports = { FTSQuery, DictionaryQuery, isAndroid, TipitakaQueryType };