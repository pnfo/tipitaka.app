"use strict"
/**
 * Load sqlite dbs and serve queries coming to it
 * sqlite will run in either in node or in android - isAndroid flag and the imports have to be set manually
 */

import { isAndroid } from './constants.js';
//const isAndroid = require('./constants.js').isAndroid;
if (isAndroid) {
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
            // const sqlite3 = require('sqlite3');
            // const path = require('path');
            // this.mode = isWrite ? (sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE) : sqlite3.OPEN_READONLY;
            // this.db = new sqlite3.Database(path.join(sqliteRootFolder, file), this.mode, err => {
            //     if (err) {
            //         console.error(`Failed to open ${file}. ${err.message}`);
            //         throw err;
            //     }
            // });
            // dynamic import since code should run on client if android
            import('sqlite3').then(sqlite3 => {
                import('path').then(path => {
                    this.mode = isWrite ? (sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE) : sqlite3.OPEN_READONLY;
                    this.db = new sqlite3.default.Database(path.join(sqliteRootFolder, file), this.mode, err => {
                        if (err) {
                            console.error(`Failed to open ${file}. ${err.message}`);
                            throw err;
                        }
                    });

                }).catch(error => {
                    console.error('Error importing "path" module:', error);
                });
            }).catch(error => {
                console.error('Error importing "sqlite3" module:', error);
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

//module.exports = SqliteDB;

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