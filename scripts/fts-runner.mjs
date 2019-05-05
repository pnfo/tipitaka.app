/**
 * backend for the full text search - this would load the word(dict) and offset data files and search the data files
 * according to the query passed in by the user. 
 * This code would run on the server (FTSUseNode) or locally (browser) in case of offline apps.
 */

"use strict";
//import fs from 'fs'; // require can not be used with mjs - uncomment if FTSUseNode
const isRegExp = (term) => /[\[\]\\\^\$\.\|\?\*\+\(\)]/g.exec(term); 

class DataLoader {
    constructor(dataUrl, name, dbVersion = 1) {
        this.dataUrl = dataUrl;
        this.name = name;
        this.data = [];
        this.dataLoaded = false;
        this.dataLoading = false; // prevent multiple loads

        // if (!FTSUseNode) {
        //     this.dbVersion = dbVersion;
        //     this.db = new Dexie(this.name);
        //     this.dbBulkAddLimit = 100000;
        // }
    }
    async load() {
        // if (!FTSUseNode) {
        //     let dbSize = await this.db.data.count();
        //     if (dbSize > 0) {
        //         console.log(`fts ${this.name}:${this.dbVersion} already in IDB size: ${dbSize}`);
        //         this.dataLoaded = true; 
        //     }
        // }
        
        if (this.dataLoading || this.dataLoaded) return; // prevent multiple loads
        this.dataLoading = true;
        let dataStr;
        try {
            if (FTSUseNode) {
                //const fs = require('fs');
                //const util = require('util');
                //const readFile = util.promisify(fs.readFile);
                dataStr = await fs.promises.readFile(this.dataUrl, {encoding: 'utf-8'});
                console.log(dataStr.length);
            } else {
                dataStr = await $.get(this.dataUrl);
            }
        } catch (err) {
            throw new Error(`Failed to load the ${this.name} from ${this.dataUrl}. ${err}`);
        }
        await this.processDataStr(dataStr); 
        console.log(`${this.name} loaded size: ${this.data.length}`);
        this.dataLoaded = true;
    }
    getData(ind) {
        return this.data[ind]; 
    }
    // async loadDataFromIndexedDB(indexes) {
    //     const idbEntries = await this.db.data.where('id').anyOf(indexes).toArray();
    //     idbEntries.forEach(idbEntry => this.data.push(idbEntry.entry));
    // }
}

class OffsetsLoader extends DataLoader {
    constructor(dataUrl, name, dbVersion = 1) {
        super(dataUrl, name, dbVersion);
        // if (!FTSUseNode) {
        //     this.db.version(this.dbVersion).stores({
        //         data: '++id'
        //     });
        // }
    }
    async processDataStr(dataStr) {
        const lines = dataStr.split('\r\n');
        for (let tIndex = 0; tIndex < lines.length; tIndex++) {
        //dataStr.split('\r\n').forEach(async (line, tIndex) => {
            const toffsets = [];
            lines[tIndex].split(',').forEach(fileOffsets => 
                toffsets.push(fileOffsets.split(':').map(o => Number(o)))
            );
            this.data.push(toffsets);
            //if (!FTSUseNode && this.data.length > this.dbBulkAddLimit)  await this.bulkAddData();
        }
        //if (!FTSUseNode) await this.bulkAddData();
    }
    // async bulkAddData() { 
    //     await this.db.data.bulkAdd(this.data.map(toffsets => { return {entry: toffsets}; }));
    //     this.data = [];
    // }
}

const DEL = Object.freeze({
    ind: 0,
    word: 1,
    total: 2,
    files: 3,
    freqs: 4,
});
class WordListLoader extends DataLoader {
    constructor(dataUrl, name, dbVersion = 1) {
        super(dataUrl, name, dbVersion);
        this.searchCache = new Map(); // results cache for matching indexes for terms
        this.settings = { 
            maxMatchingWords: 10000, // throw error if number of matching words for a term is more than this
        };
        // if (!FTSUseNode) {
        //     this.db.version(this.dbVersion).stores({
        //         data: '++id,token'
        //     });
        // }
    }
    async processDataStr(dataStr) {
        const lines = dataStr.split('\r\n');
        for (let tIndex = 0; tIndex < lines.length; tIndex++) {
        //dataStr.split('\r\n').forEach((line, tIndex) => {
            const parts = lines[tIndex].split(',');
            const entry = [ tIndex, parts[0], Number(parts[1]), [], [] ];
            for (let i = 2; i < parts.length; i++) {
                const ff = parts[i].split(':'); 
                entry[DEL.files].push(ff[0]);
                entry[DEL.freqs].push(Number(ff[1]));
            }
            this.data.push(entry);
            //if (!FTSUseNode && this.data.length > this.dbBulkAddLimit) await this.bulkAddData();
        }
        //if (!FTSUseNode) await this.bulkAddData();
    }
    // async bulkAddData() {
    //     await this.db.data.bulkAdd(this.data.map(entry => { return {token: entry[DEL.word], entry}; }));
    //     this.data = [];
    // }
    binarySearch(start, end, term, termReg) {
        const mid = Math.floor((start + end) / 2.0);
        if (termReg.exec(this.data[mid][DEL.word])) return mid; // found a matching one
        //console.log(`start mid end ${start} ${mid} ${end}`);
        if (start == mid) return -1; // not found
        if (this.data[mid][DEL.word] > term) {
            return this.binarySearch(start, mid, term, termReg);
        }
        return this.binarySearch(mid, end, term, termReg);
    }
    searchDataArray(term, termReg) {
        let indexes = [];
        if (isRegExp(term)) {
            console.log(`linear search for term ${term}`);
            for (let ind = 0; ind < this.data.length; ind++) {
                if (termReg.exec(this.data[ind][DEL.word])) indexes.push(ind);
            }
        } else {
            let ind = this.binarySearch(0, this.data.length - 1, term, termReg); // find index of a matching word
            if (ind < 0) return [];
            let startInd = ind, endInd = ind + 1;
            while (startInd >= 0 && termReg.exec(this.data[startInd][DEL.word])) {
                indexes.push(startInd);
                startInd--;
            }
            while (endInd < this.data.length && termReg.exec(this.data[endInd][DEL.word])) {
                indexes.push(endInd);
                endInd++;
            }
        }
        return indexes;
    }
    // async searchIndexedDb(term, termReg) {
    //     let indexes = [];
    //     if (isRegExp(term)) {
    //         console.log(`linear search for term ${term}`);
    //         indexes = await this.db.data.filter(entry => termReg.exec(entry.word)).primaryKeys();
    //     } else {
    //         indexes = await this.db.data.where('token').startsWith(term).primaryKeys();
    //     }
    //     return indexes;
    // }

    checkTermMatch(entry, termReg) {
        return termReg.exec(this.data[ind][DEL.word]);
    }
    async getMatchingIndexes(term, exactWord) {
        console.log(`exact word ${exactWord}`);
        const termRegStr = `^${term}${exactWord ? '$' : ''}`;
        console.log(`exact word ${exactWord} termregstr ${termRegStr}`);
        if (this.searchCache.has(termRegStr)) {
            return this.searchCache.get(termRegStr);
        }
        // search the data array or indexDb
        const termReg = new RegExp(termRegStr, 'i');
        const indexes = this.searchDataArray(term, termReg); // : await this.searchIndexedDb(term, termReg);

        /*if (indexes.length >= this.settings.maxMatchingWords) {
            throw new Error(`Number of words matching the term ${term} is more than ${this.settings.maxMatchingWords}. Please make that term more unique.`)
        }*/
        console.log(`term ${term} has ${indexes.length} matching words`);
        this.searchCache.set(termRegStr, indexes); // TODO need to prevent from growing too much
        return indexes;
    }
    getFiles(indexes, filter) { 
        const filterReg = filter ? new RegExp(`^[${filter.join('')}]`) : '';
        const allFiles = new Set();
        indexes.forEach(ind => {
            this.data[ind][DEL.files].forEach(file => {
                if (!filterReg || filterReg.exec(file)) allFiles.add(file); // filter is undefined if no filtering
            });
        });
        return allFiles;
    }
}

const FTSQT = Object.freeze({
    initData: 'init-data',
    getMatches: 'get-matches',
});

class FTSQuery {
    constructor(obj) {
        this.type = obj.type;
        this.terms = obj.terms;
        this.params = obj.params;
    }
    checkQuery() { // check for errors
        if (this.type == FTSQT.initData) return;
        if (!this.terms || !this.terms.length || this.terms.some(t => !t)) throw new Error(`Query terms all or some empty`);
        this.terms.forEach(term => {
            try { new RegExp(term); } catch(e) {
                throw new Error(`${term} is not a valid regular expression`);
            }
        });
        if (!this.type || !this.terms || !this.params) {
            throw new Error(`Query type, terms and params should not be empty`);
        }
        if (typeof this.type != 'string' || typeof this.terms != 'object' || typeof this.params != 'object') {
            throw new Error(`Query type, terms and params should be of type string, object and object`);
        }
    } 
    async send() {
        this.checkQuery(); // will throw on error
        return await ftsRunner.runQuery(this);
    }
}

class FTSResponse {
    constructor(query) {
        this.query = query;
        this.stats = {};
    }
    isEmpty() { return true; }
}

class MatchStore extends FTSResponse {
    constructor(query) {
        super(query);
        this.wordInfo = {};
        this.matchesMap = new Map();
        this.matches = [];  // array of matches
    }
    //isEmpty() { return this.matches.length == 0; }

    add(matchesForFile, file) {
        matchesForFile.forEach(match => {
            const matchStr = match.map(wo => wo[0]).join('-');
            const offsets = match.map(wo => wo[1]);
            if (!this.matchesMap.has(matchStr)) {
                this.matchesMap.set(matchStr, this.matches.length);
                this.matches.push([ match.map(wo => wo[0]), 1, {[file]: [offsets]}, 1 ]); // 4 elem array (indexes, freq, offsetsByFile, numFiles)
            } else {
                const i = this.matchesMap.get(matchStr);
                const match = this.matches[i];
                match[1]++;
                if (match[2][file]) {
                    match[2][file].push(offsets)
                } else {
                    match[2][file] = [offsets]; 
                    match[3]++; // num files
                }
            }
        });
    }
    finalize(wordLoader) {
        this.matches = this.matches.sort((a, b) => b[1] - a[1]).slice(0, this.query.params.maxMatches);
        
        this.matches.forEach(match => {
            // sort the file offsets and cutoff
            match[2] = Object.keys(match[2]).map(file => [file, match[2][file], match[2][file].length])
                .sort((a, b) => b[2] - a[2]).slice(0, this.query.params.maxFiles);
            // get word info for each matched word(ind) to be sent to the 
            match[0].forEach(ind => {
                if (!this.wordInfo[ind]) {
                    const entry = wordLoader.getData(ind);
                    this.wordInfo[ind] = [ entry[DEL.word], entry[DEL.total], entry[DEL.files].length ]; // total-freq and #files are not really needed
                }
            })
        });
        this.stats = { 'considered': this.matchesMap.size, 'returned': this.matches.length };
    }
}

class FTSRunner {
    constructor() {}
    async runQuery(query) {
        switch (query.type) {
            case FTSQT.initData:
                return await this.checkDataLoaded(query);
            case FTSQT.getMatches:
                return this.getMatches(query);
        }
    }

    async checkDataLoaded(query) {
        if (this.wordLoader) return new FTSResponse(query); // already loading or loaded
        const jsonBaseFolder = FTSUseNode ? './static/json' : '../static/json';
        this.wordLoader = new WordListLoader(`${jsonBaseFolder}/dict-all.txt`, 'dict');
        this.offLoader = new OffsetsLoader(`${jsonBaseFolder}/pos-all.txt`, 'offsets');
        console.log('start loading fts data');
        await Promise.all([this.wordLoader.load(), this.offLoader.load()]); // load in parallel
        return new FTSResponse(query);
    }
    getWordCombinations(indexList, file, params) {
        // for each term find the words that occur in the given file
        const filteredIL = indexList.map(indexes => indexes.filter(ind => this.wordLoader.getData(ind)[DEL.files].indexOf(file) >= 0));
        // for each term create [word(ind/token), offset] pairs within the file
        const WOList = filteredIL.map(indexes => {
            let termWOs = [];
            indexes.forEach(ind => {
                const fileInd = this.wordLoader.getData(ind)[DEL.files].indexOf(file);
                termWOs = termWOs.concat(this.offLoader.getData(ind)[fileInd].map(offset => [ind, offset]));
            });
            return termWOs.sort((a, b) => b[1] - a[1]); // sort by offset
        });

        if (WOList.length == 1) return WOList[0].map(wo => [wo]); // no need to check offsets of other terms

        // find matching words based on word distance and order params
        const matches = [];
        WOList[0].forEach(([ind, off]) => {
            this.searchOffsetMatches(params, WOList, 1, [off], [[ind, off]], matches);
        });
        return matches;
    }
    searchOffsetMatches(params, WOList, termI, matchedOffsets, curMatch, matches) {
        if (WOList.length <= termI) { // all terms have been matched
            matches.push(curMatch); // matches found - modify the matches by adding new Matches
            return false;
        }

        const minOff = Math.min(...matchedOffsets), maxOff = Math.max(...matchedOffsets);
        let nextRange;
        if (params.exactPhrase) { // next word should be within this offset range
            nextRange = [maxOff + 1, maxOff + 1];
        } else if (params.matchOrder) {
            nextRange = [maxOff + 1, minOff + params.wordDistance]; 
        } else {
            nextRange = [maxOff - params.wordDistance, minOff + params.wordDistance]; 
        }
        // next word should be in the range and also should not match the already matched offsets
        const matchingPairsI = WOList[termI].filter(([indI, offI]) => {
            return nextRange[0] <= offI && offI <= nextRange[1] && matchedOffsets.indexOf(offI) < 0;
        });
        if (matchingPairsI.length == 0) return false; // no matches

        matchingPairsI.forEach(([ind, off]) => {
            this.searchOffsetMatches(params, WOList, termI + 1, [...matchedOffsets, off], [...curMatch, [ind, off]], matches);
        });
        return false; // matches already added if any
    }
    intersectFiles(fileList, terms) {
        let intersect = [...fileList[0]];
        for (let i = 1; i < fileList.length; i++) {
            intersect = intersect.filter(x => fileList[i].has(x));
        }
        console.log(`number of files with all the terms: ${intersect.length} terms: ${terms}`);
        return intersect;
    }
    
    checkQueryExplosion(terms, files, indexList) {
        indexList.forEach((indexes, termInd) => {
            if ((indexes.length * files.length) > 10000000) { // 10000 * 1000 used as rough measure
                console.log(`indexes x files = ${indexes.length * files.length} terms: ${terms}`);
                throw new Error(`The term ${terms[termInd]} is making this query run slower. Please make that term more unique.`);
            }
        });
    }
    // async loadDataFromIndexedDB(indexList) {
    //     const sortedInd = Array.from(new Set([].concat(...indexList))).sort((a, b) => (a - b));
    //     await Promise.all([this.wordLoader.loadDataFromIndexedDB(sortedInd), this.offLoader.loadDataFromIndexedDB(sortedInd)]); 
    //     return indexList.map(indexes => indexes.map(index => sortedInd.indexOf(index)));
    // }

    async getMatches(query) { // at this point all the data is loaded
        let timer = new Date();
        let indexList = await Promise.all(
            query.terms.map(async term => await this.wordLoader.getMatchingIndexes(term, query.params.exactWord)));

        // load the data from indexed db and rewrite indexes so that rest of the algo can run without accessing indexed db
        // if (!FTSUseNode) { 
        //    indexList = await this.loadDataFromIndexedDB(indexList); 
        // }
        // get files for each term and intersect to find files that have all terms
        const fileList = indexList.map(indexes => this.wordLoader.getFiles(indexes, query.params.filter)); // array of sets
        const files = this.intersectFiles(fileList, query.terms);

        this.checkQueryExplosion(query.terms, files, indexList); // throws if (num files) x (num indexes) is too big for a term

        // for each file check the available words within the word distance
        const matchesByFile = new Map();
        files.map(file => matchesByFile.set(file, this.getWordCombinations(indexList, file, query.params)));

        const matchStore = new MatchStore(query);
        matchesByFile.forEach((matches, file) => matchStore.add(matches, file));

        matchStore.finalize(this.wordLoader); // sort/cut by freq
        console.log(`Query ${query.terms} ran in ${new Date() - timer} ms.`);
        return matchStore;
    }
}

const FTSUseNode = false;

const ftsRunner = new FTSRunner();

export { FTSQuery, ftsRunner, WordListLoader, DataLoader, DEL, FTSUseNode };
//module.exports = {FTSQuery, ftsRunner, DataLoader, DEL};

// run tests with the command
// node --experimental-modules ./misc/server/fts-runner.mjs
const FTSRunTests = false;
if (FTSUseNode && FTSRunTests) {
    const condMsg = (cond, msg) => { if(!cond) console.error(msg); };
    
    async function testRunner(matchCount, wordCount, terms, exactWord, exactPhrase, matchOrder = null, wordDistance = null, filter = null) {
        try {
            const ms = await new FTSQuery({type: FTSQT.getMatches, terms, 
                params: {exactWord, exactPhrase, matchOrder, wordDistance, maxMatches: 100, filter}}).send();
            
            let expectedCount = ms.matches.length;
            condMsg(expectedCount == matchCount, `matchCount for ${terms} mismatch got ${expectedCount}`);
            expectedCount = Object.keys(ms.wordInfo).length;
            condMsg(expectedCount == wordCount, `wordCount for ${terms} mismatch got ${expectedCount}`);
            //console.log(`first match freq = ${ms.matches[0][1]}`);
        } catch(err) {
            console.error(err);
        }
    }

    // init data and then run tests
    new FTSQuery({type: FTSQT.initData}).send().then(() => {
        testRunner(100, 100, ['ජනක'], false, true); // cutoff by maxMatches
        testRunner(100, 100, ['[ව]'], false, true); // regex with huge number of matches, cause error
        testRunner(100, 100, ['න'], false, true); // with huge number of matches, cause error
        testRunner(1, 4, ['න', 'සො', 'ධම්මං', 'විජානාති'], false, true); // combined not cause error
        testRunner(100, 100, ['වී'], false, true); // with huge number of matches
        testRunner(32, 48, ['වෙ', 'වී'], false, true); // combined with huge number of matches for each term
        testRunner(100, 78, ['වෙ', 'වී'], false, false, false, 99); // combined with huge number of matches for each term
        
        testRunner(2, 4, ["බුද්ධො", "භගවා", "වෙරඤ්ජා.*"], true, true);
        testRunner(6, 6, ['.*ජනක'], true, false); // regex
        testRunner(1, 2, ["බුද්ධො", "භගවා"], true, true, null, null, ['1', '2']); //filter only vin and abhi mula

        testRunner(2, 3, ["බුද්ධො", "වෙරඤ්ජා.*"], false, false, true, 2); // match order & word distance
        testRunner(4, 6, ["එකං", "සමයං", "භගවා.*"], false, false, true, 10); // match order & word distance
        const termStr = 'යො බාලො මඤ්ඤති බාල්යං පණ්ඩිතො වාපි තෙන සො බාලො ච පණ්ඩිතමානී ස වෙ බාලොති වුච්චති';
        testRunner(1, 14, termStr.split(' '), true, true); // many terms
    });
    
}
