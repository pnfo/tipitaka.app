"use strict"
/**
 * Load sqlite dbs and serve queries coming to it
 * 
 */

export const isAndroid = false; // determines how to access the sqlite dbs (through webview in android or read sqlite files in node)
// if true comment the line below
import sqlite3 from 'sqlite3';

// extending classes that query data should implement the parseRow() function
export class SqliteDB {
    constructor(file, isWrite = false) {
        this.file = file;
        if (!isAndroid) {
            this.mode = isWrite ? (sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE) : sqlite3.OPEN_READONLY;
            this.db = new sqlite3.Database(file, this.mode, err => {
                if (err) {
                    console.error(`Failed to open ${file}. ${err.message}`);
                    throw err;
                }
            });
        } else {
            this.db = Android.openDb(dbFile);
        }
    }
    // gets the first result
    async loadOne(sql, params) {
        const row = await (isAndroid ? Android.get(sql, params) : this.getAsync(sql, params));
        return [this.parseRow(row)];
    }
    // gets all that matches
    async loadAll(sql, params) {
        const rows = await (isAndroid ? Android.all(sql, params) : this.allAsync(sql, params));
        return rows.map(row => this.parseRow(row));
    }

    async runAsync(sql) {
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
    run(...args) {
        this.db.run(...args);
        return this;
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

"use strict";



//export const runServerLocally = true; // start servers and point the queries locally (1 = node & android, 0 = browser/web)
/**
 * FTSQuery and result sets - interface with the client
 */
export const TipitakaQueryType = Object.freeze({
    FTS: 'fts',
    DICT: 'dict',
    TOKEN: 'token', // for future
});
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
        
        /*if (runServerLocally) { // do locally - in the case of android or running in server
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
            
        }*/
    }
    checkQuery() {
        if (!this.query.type) {
            throw Error(`Query type can not be empty.`);
        }
    }
}




//export { SqliteDB, TipitakaQuery, TipitakaQueryType, runServerLocally };
//module.exports = {
//    SqliteDB: SqliteDB,
//};