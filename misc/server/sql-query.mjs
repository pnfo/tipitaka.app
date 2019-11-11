"use strict"
/**
 * Load sqlite dbs and serve queries coming to it
 * sqlite will run in either in node or in android - isAndroid flag and the imports have to be set manually
 */

export const isAndroid = true; // determines how to access the sqlite dbs (through webview in android or read sqlite files in node)
// if true comment out the 2 lines below which import node includes
//import sqlite3 from 'sqlite3';
//import path from 'path';

if (Android) {
    const dbVersions = { // updated dbs need to be marked here for update in android side
        'my-23-vol': 1,
    };
    Android.initDbVersions(JSON.stringify(dbVersions));
    Android.openDb('static/db/dict-all.db'); // force download the big fts db at the beginning
}

let sqliteRootFolder = '';  // add extra base url in macos

// extending classes that query data should implement the parseRow() function
export class SqliteDB {
    constructor(file, isWrite = false) {
        this.file = file;
        if (!isAndroid) {
            this.mode = isWrite ? (sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE) : sqlite3.OPEN_READONLY;
            this.db = new sqlite3.Database(path.join(sqliteRootFolder, file), this.mode, err => {
                if (err) {
                    console.error(`Failed to open ${file}. ${err.message}`);
                    throw err;
                }
            });
        } else {
            // need to copy the db from assets folder before it can be opened
            this.db = Android.openDb(file); // this will return version+filename
        }
    }
    static setRootFolder(folder) { // add extra base url in macos
        sqliteRootFolder = folder;
    }
    parseRow(row) { // should be overridden in subclasses 
        return row;
    }
    // gets the first result
    async loadOne(sql, params) {
        if (isAndroid) { // load one or all, both the same for Android
            return this.loadAll(sql, params);
        }
        const row = await this.getAsync(sql, params);
        return row ? [this.parseRow(row)] : [];
    }
    // gets all that matches
    async loadAll(sql, params) {
        const rows = await (isAndroid ? this.androidGet(sql, params) : this.allAsync(sql, params));
        return rows.map(row => this.parseRow(row));
    }
    androidGet(sql, params) {
        try {
            const jsonStr = Android.all(this.db, sql, params);
            return JSON.parse(jsonStr);
        } catch (err) {
            console.error(err);
            throw new Error("Please wait until database copy finished. Then search again.");
        }
    }

    /*async runAsync(sql) { // not used - if used should implement for Android
        return new Promise((resolve, reject) => {
            this.db.run(sql, function (err, row) {
                if (err) {
                    console.error(`Sqlite Run Failed ${sql}. ${err.message}`);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }
    run(...args) { // not used
        this.db.run(...args);
        return this;
    }*/
    async getAsync(sql, params) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    console.error(`Sqlite Get Failed ${sql}. ${err.message}`);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }
    async allAsync(sql, params) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, row) => {
                if (err) {
                    console.error(`Sqlite All Failed ${sql}. ${err.message}`);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }
    close() {
        this.db.close((err) => {
            if (err) {
                console.error(`Closing db ${this.file} failed ${err.message}`);
            }
        }); 
    }
}

//export const runServerLocally = true; // start servers and point the queries locally (1 = node & android, 0 = browser/web)
/**
 * FTSQuery and result sets - interface with the client
 */
export const TipitakaQueryType = Object.freeze({
    FTS: 'fts',
    DICT: 'dict',
    TOKEN: 'token', // for future
});

// TODO this class is actually not needed 
/*
const TipitakaServerURLEndpoint = './tipitaka-query/'; // https://tipitaka.app/nodejs/
export class TipitakaQuery {
    constructor(query) {
        this.query = query;
        this.checkQuery();
    }
    async runQuery() {
        const responseObj = await $.post(TipitakaServerURLEndpoint, JSON.stringify(this.query));
        if (responseObj.error) {
            throw new Error(responseObj.error);
        }
        return responseObj;
        
        if (runServerLocally) { // do locally - in the case of android or running in server
            switch(this.query.type) {
                case TipitakaQueryType.FTS:
                    const ms = await ftsServer.runQuery(this.query);
                    return { query: ms.query, wordInfo: ms.wordInfo, matches: ms.matches, stats: ms.stats };
                case TipitakaQueryType.DICT:
                    const matches = await dictServer.runQuery(this.query);
                    return { query: this.query, matches: matches };
                default:
                    throw Error(`Unhandled query type ${this.query.type}`);
            }
        } else { // running in browser
            
        }
    }
    checkQuery() {
        if (!this.query.type) {
            throw Error(`Query type can not be empty.`);
        }
    }
}
*/



//export { SqliteDB, TipitakaQuery, TipitakaQueryType, runServerLocally };
//module.exports = {
//    SqliteDB: SqliteDB,
//};