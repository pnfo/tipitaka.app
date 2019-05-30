"use strict";

import { SqliteDB, TipitakaQuery, TipitakaQueryType } from './sql-query.mjs';

/** Loading and searching a single dictionary */
class DictionaryDb extends SqliteDB {
    constructor(dictName) {
        try {
            super(`${dictDataFileFolder}/${dictName}.db`, false);
            this.isLoaded = true;
        } catch(err) {
            this.isLoaded = false;
        }
        this.dictName = dictName;
    }
    async searchWord(word) {
        if (!this.isLoaded) return []; // dict failed to load - possible dict name change
        const exactMatches = await this.loadAll('SELECT rowid, word, meaning FROM dictionary WHERE word LIKE ?', [word]);
        if (exactMatches.length) {
            return exactMatches;
        }
        const stripEnd = word.replace(/[\u0DCA-\u0DDF\u0D82\u0D83]$/g, '');
        return await this.loadAll('SELECT rowid, word, meaning FROM dictionary WHERE word LIKE ? LIMIT 100', [stripEnd])
    }
    parseRow(row) { // object with word & meaning keys
        return row;
    }
}


const maxResults = 100;
const dictDataFileFolder = 'static/dicts';

/** Loading searching dictionaries based on the user input */
export class DictionaryServer {
    constructor() {
        this.loadedDicts = new Map();
    }

    /* Load dict if not already loaded */
    async loadDictionary(dictName) {
        if (this.loadedDicts.has(dictName)) return true; //already loaded
        try {
            this.loadedDicts.set(dictName, new DictionaryDb(dictName));
            return true;
        } catch(e) {
            console.log(`failed to load ${dictName}`);
            return false;
        }
    }

    async runQuery(query) { // query has (sinh)word, dictlist, limit
        console.log(`searching for word ${query.word} in dictionaries ${query.dictionaries} limit ${query.limit}`);
        // try loading specified dictionaries if not loaded
        query.dictionaries.forEach(dictName => {
            if (!this.loadedDicts.has(dictName)) {
                this.loadedDicts.set(dictName, new DictionaryDb(dictName))
            }
        });
        const matchesAr = await Promise.all(query.dictionaries.map(
            dictName => this.loadedDicts.get(dictName).searchWord(query.word)
        ));
        let matches = [];
        query.dictionaries.forEach((dictName, i) => matches.push(...matchesAr[i].map(match => { 
            match.dictName = dictName;
            match.distance = levenshtein(match.word, query.word);
            return match; 
        })));
        // sort by edit distance to the input word
        matches.sort((a, b) =>  a.distance - b.distance).splice(Math.min(maxResults, query.limit));
        return matches;
    }
}

class BreakupServer {
    constructor() {
        this.db = new SqliteDB('static/db/breakups.db', false);
    }
    async runQuery(query) {
        const exactBreakups = await this.db.loadAll('SELECT rowid, word, type, origin, breakstr FROM breakup WHERE word = ?', [query.word]);
        if (exactBreakups.length) {
            return exactBreakups;
        }
        const stripEnd = query.word.replace(/[\u0DCA-\u0DDF\u0D82\u0D83]$/g, '');
        return await this.db.loadAll('SELECT rowid, word, type, origin, breakstr FROM breakup WHERE word = ?', [stripEnd]);
    }
}

let dictServer, breakupServer;
export class DictionaryQuery {
    constructor(query) {
        this.query = query;
    }
    async runQuery() {
        dictServer = dictServer || new DictionaryServer(); // create if not already created
        breakupServer = breakupServer || new BreakupServer(); // create if not already created

        const [matches, breakups] = await Promise.all([dictServer.runQuery(this.query), breakupServer.runQuery(this.query)]);
        console.log(`Returning dict results of length ${matches.length} for the word ${this.query.word}`);
        return { query: this.query, matches, breakups };
    }
    checkQuery() {
        super.checkQuery();
        const { word, dictionaries, limit } = this.query;
        if (!word || !dictionaries || !dictionaries.length || !limit) {
            throw Error(`Malformed dict query ${this.query}`);
        }
    }
}

/**
 * edit distance between two strings - copied from the below url
 https://gist.github.com/andrei-m/982927/0efdf215b00e5d34c90fdc354639f87ddc3bd0a5#gistcomment-586471 
 */
function levenshtein(a, b) { 
    let tmp;
    if (a.length === 0) { return b.length; }
    if (b.length === 0) { return a.length; }
    if (a.length > b.length) { tmp = a; a = b; b = tmp; }

    let i, j, res, alen = a.length, blen = b.length, row = Array(alen);
    for (i = 0; i <= alen; i++) { row[i] = i; }

    for (i = 1; i <= blen; i++) {
        res = i;
        for (j = 1; j <= alen; j++) {
            tmp = row[j - 1];
            row[j - 1] = res;
            res = b[i - 1] === a[j - 1] ? tmp : Math.min(tmp + 1, Math.min(res + 1, row[j] + 1));
        }
    }
    return res;
}

// run tests with the command
// node --experimental-modules .\scripts\dict-server.mjs
const runTests = false;
if (runTests) {
    async function testRunner() {
        const res = await (new DictionaryQuery({word: 'ජනක', dictionaries: ['my-android'], limit: 100}).runQuery());
        console.log(res.matches);
    }
    testRunner();
}