/**
 * backend for the full text search - this would load data from the sqlite db and search for matches
 * according to the query passed in by the user. 
 * This code would run in node (website and laptop) or in browser (in case of android apps).
 * runServerLocally variable is used to control those 2 cases
 */

"use strict";

const SqliteDB = require('./sql-query.js');
//const isRegExp = (term) => /[\[\]\\\^\$\.\|\?\*\+\(\)]/g.exec(term); 

// entry/row fields and the correspoinding column names in the sqlite db
const DEL = Object.freeze({
    ind: 0, //rowid
    word: 1, // token
    total: 2, // freg
    files: 3, // files
    //freqs: 4, // this is redundant since can be obtained from offsets
    offsets: 4, //offsetstr
});

class TokenLoader extends SqliteDB {
    parseRow(row) {
        //console.log(JSON.stringify(row));
        const entry = [ row.rowid - 1, row.token, Number(row.freq), row.files.split(','), [] ];
        row.offsetstr.split(',').forEach(fileOffsets => {
            entry[DEL.offsets].push(fileOffsets.split(':').map(o => Number(o)));
        });
       return entry;
    }
    // for the given term find the matching indexes and load data for the same
    async getDataForTerm(term, exactWord) {
        console.log(`exact word ${exactWord} term ${term}`);
        if (!exactWord && term.slice(-1) != '%') term += '%';
        if (!exactWord || /_|%/.test(term)) {
            return await this.loadAll(`SELECT rowid, * FROM tokens WHERE token LIKE ?`, [term]);
        } else {
            return await this.loadOne('SELECT rowid, * FROM tokens WHERE token = ?', [term]);
        }
    }
}

class FTSServer {
    constructor() {
        this.dataLoader = new TokenLoader('static/db/dict-all.db', false); // all queries sent to this db file
    }

    async runQuery(query) {
        return this.getMatches(query);
    }

    getWordCombinations(dataList, file, params) {
        //const filteredIL = dataList.map(indexes => indexes.filter(ind => this.wordLoader.getData(ind)[DEL.files].indexOf(file) >= 0));
        
        const WOList = dataList.map(data => {
            // for each term find the words that occur in the given file
            const filteredData = data.filter(entry => entry[DEL.files].indexOf(file) >= 0);
            // for each term create [word(ind/rowid), offset] pairs within the file
            let termWOs = [];
            filteredData.forEach(entry => {
                const fileInd = entry[DEL.files].indexOf(file);
                termWOs = termWOs.concat(entry[DEL.offsets][fileInd].map(offset => [entry[DEL.ind], offset]));
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
    intersectFiles(dataList, filter) {
        const filterReg = filter ? new RegExp(`^[${filter.join('')}]`) : null;
        const fileList = dataList.map(data => this.getFiles(data));

        let intersect = [...fileList[0]].filter(file => !filterReg || filterReg.test(file)); // filtering the first set is enough
        for (let i = 1; i < fileList.length; i++) {
            intersect = intersect.filter(file => fileList[i].has(file));
        }
        return intersect;
    }
    getFiles(data) { 
        let allFiles = [];
        // push is faster than concat for large number of arrays
        // https://dev.to/uilicious/javascript-array-push-is-945x-faster-than-array-concat-1oki
        data.forEach(entry => allFiles.push(...entry[DEL.files])); 
        return new Set(allFiles); // removes duplicates
    }
    
    checkQueryExplosion(terms, files, dataList) {
        dataList.forEach((data, termInd) => {
            if ((data.length * files.length) > 10000000) { // 10000 * 1000 used as rough measure
                console.log(`indexes x files = ${data.length * files.length} terms: ${terms}`);
                throw new Error(`The term ${terms[termInd]} is making this query run slower. Please make that term more unique.`);
            }
        });
    }

    async getMatches(query) {
        let timer = new Date();
        const dataList = await Promise.all(
            query.terms.map(async term => await this.dataLoader.getDataForTerm(term, query.params.exactWord)));

        // get files for each term and intersect to find files that have all terms
        const files = this.intersectFiles(dataList, query.params.filter);
        console.log(`number of files with all the terms: ${files.length} terms: ${query.terms}`);

        this.checkQueryExplosion(query.terms, files, dataList); // throws if (num files) x (num indexes) is too big for a term

        // for each file check the available words within the word distance
        const matchesByFile = new Map();
        files.map(file => matchesByFile.set(file, this.getWordCombinations(dataList, file, query.params)));

        const matchStore = new MatchStore(query);
        matchesByFile.forEach((matches, file) => matchStore.add(matches, file));

        matchStore.finalize(dataList); // sort/cut by freq
        console.log(`Query ${query.terms} ran in ${new Date() - timer} ms.`);
        return matchStore;
    }
}

class MatchStore {
    constructor(query) {
        this.query = query;
        this.stats = {};
        this.wordInfo = {};
        this.matchesMap = new Map();
        this.matches = [];  // array of matches
    }

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
    finalize(dataList) {
        this.matches = this.matches.sort((a, b) => b[1] - a[1]).slice(0, this.query.params.maxMatches); // matches sorted by the freq

        this.matches.forEach(match => {
            // sort the file offsets and cutoff
            match[2] = Object.keys(match[2]).map(file => [file, match[2][file], match[2][file].length])
                .sort((a, b) => this.query.params.sortByBook ? sortByBookThenFreq(a, b) : b[2] - a[2]) // sort by book or by num offsets
                .slice(0, this.query.params.maxFiles);
            // get word info for each matched word(ind) to be sent to the client
            match[0].forEach((ind, termI) => {
                if (!this.wordInfo[ind]) {
                    const entry = dataList[termI].find(entry => entry[DEL.ind] == ind);
                    this.wordInfo[ind] = [ entry[DEL.word], entry[DEL.total], entry[DEL.files].length ]; // total-freq and #files are not really needed
                }
            })
        });
        this.stats = { 'considered': this.matchesMap.size, 'returned': this.matches.length };
    }
}
const fileNameStarts = [ // order of books - [vin, su ,abhi] and [m, a, t, anya]
    ['1'], ['a','b','c','d','e'], ['2'], ['3'], ['f','g','h','i','j'], ['4'], ['5'], ['k','l','m','n','o'], ['6'], ['p','q','r','s','t','u','v','w','x','y']
];
const fileNameStartsIndex = file => fileNameStarts.findIndex(ar => ar.indexOf(file.charAt(0)) != -1);
const sortByBookThenFreq = (a, b) => {
    const difInd = fileNameStartsIndex(a[0]) - fileNameStartsIndex(b[0]);
    return difInd != 0 ? difInd : b[2] - a[2];
};

let ftsServer;
class FTSQuery {
    constructor(query) {
        this.query = query;
    }
    async runQuery() {
        ftsServer = ftsServer || new FTSServer(); // create if not already created
        try {
            const ms = await ftsServer.runQuery(this.query);
            return { query: ms.query, wordInfo: ms.wordInfo, matches: ms.matches, stats: ms.stats };
        } catch (err) {
            console.error(`Sending error response: ${err}`);
            return { error: err.message };
        }
    }
    checkQuery() {
        const { type, terms, params } = this.query; // destructure object
        if (!terms || !terms.length || terms.some(t => !t)) throw new Error(`Query terms all or some empty`);
        terms.forEach(term => {
            try { new RegExp(term); } catch(e) {
                throw new Error(`${term} is not a valid regular expression`);
            }
        });
        if (!type || !terms || !params) {
            throw new Error(`Query type, terms and params should not be empty`);
        }
        if (typeof type != 'string' || typeof terms != 'object' || typeof params != 'object') {
            throw new Error(`Query type, terms and params should be of type string, object and object`);
        }
    }
}

module.exports = FTSQuery;

// run tests with the command
// node --experimental-modules .\scripts\fts-server.mjs
const FTSRunTests = false;
if (FTSRunTests) {
    const condMsg = (cond, msg) => { if(!cond) console.error(msg); };
    
    async function testRunner(matchCount, wordCount, terms, exactWord, exactPhrase, matchOrder = null, wordDistance = null, filter = null) {
        try {
            const ms = await new FTSQuery({type: 'fts', terms, params: {exactWord, exactPhrase, matchOrder, wordDistance, maxMatches: 100, filter}}).runQuery();
            
            let expectedCount = ms.matches.length;
            condMsg(expectedCount == matchCount, `== matchCount for ${terms.join(' , ')} mismatch need ${matchCount}, got ${expectedCount}`);
            expectedCount = Object.keys(ms.wordInfo).length;
            condMsg(expectedCount == wordCount, `== wordCount for ${terms.join(' , ')} mismatch need ${wordCount}, got ${expectedCount}`);
            //console.log(`first match freq = ${ms.matches[0][1]}`);
        } catch(err) {
            console.error(err);
        }
    }

    // run tests
    async function runAllTests() {
        await testRunner(100, 100, ['ජනක'], false, true); // cutoff by maxMatches
        await testRunner(100, 100, ['%ව%'], false, true); // regex with huge number of matches, cause error
        await testRunner(100, 100, ['න'], false, true); // with huge number of matches, cause error
        await testRunner(1, 4, ['න', 'සො', 'ධම්මං', 'විජානාති'], false, true); // combined not cause error
        await testRunner(100, 100, ['වී'], false, true); // with huge number of matches
        await testRunner(32, 48, ['වෙ', 'වී'], false, true); // combined with huge number of matches for each term
        await testRunner(100, 78, ['වෙ', 'වී'], false, false, false, 99); // combined with huge number of matches for each term
        
        await testRunner(2, 4, ["බුද්ධො", "භගවා", "වෙරඤ්ජා%"], true, true);
        await testRunner(6, 6, ['%ජනක'], true, false); // regex
        await testRunner(7, 8, ["බුද්ධො", "භගවා"], false, true, null, null);
        await testRunner(1, 2, ["බුද්ධො", "භගවා"], false, true, null, null, ['1', '2']); //filter only vin and abhi mula

        await testRunner(2, 3, ["බුද්ධො", "වෙරඤ්ජා%"], false, false, true, 2); // match order & word distance
        await testRunner(4, 6, ["එකං", "සමයං", "භගවා%"], false, false, true, 10); // match order & word distance
        const termStr = 'යො බාලො මඤ්ඤති බාල්යං පණ්ඩිතො වාපි තෙන සො බාලො ච පණ්ඩිතමානී ස වෙ බාලොති වුච්චති';
        await testRunner(1, 14, termStr.split(' '), true, true); // many terms
    }
    //for (let i =0; i< 100; i++)
    runAllTests();
}
