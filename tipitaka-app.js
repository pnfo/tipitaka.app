'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var restify = _interopDefault(require('restify'));
var open = _interopDefault(require('open'));
var colors = _interopDefault(require('colors'));
var path = _interopDefault(require('path'));
var fs = _interopDefault(require('fs'));
var sqlite3 = _interopDefault(require('sqlite3'));

let sqliteRootFolder = '';

// extending classes that query data should implement the parseRow() function
class SqliteDB {
    constructor(file, isWrite = false) {
        this.file = file;
        {
            this.mode = isWrite ? (sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE) : sqlite3.OPEN_READONLY;
            this.db = new sqlite3.Database(path.join(sqliteRootFolder, file), this.mode, err => {
                if (err) {
                    console.error(`Failed to open ${file}. ${err.message}`);
                    throw err;
                }
            });
        }
    }
    static setRootFolder(folder) {
        sqliteRootFolder = folder;
    }
    parseRow(row) { // should be overridden in subclasses 
        return row;
    }
    // gets the first result
    async loadOne(sql, params) {
        const row = await (this.getAsync(sql, params));
        return row ? [this.parseRow(row)] : [];
    }
    // gets all that matches
    async loadAll(sql, params) {
        const rows = await (this.allAsync(sql, params));
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



//export const runServerLocally = true; // start servers and point the queries locally (1 = node & android, 0 = browser/web)
/**
 * FTSQuery and result sets - interface with the client
 */
const TipitakaQueryType = Object.freeze({
    FTS: 'fts',
    DICT: 'dict',
    TOKEN: 'token', // for future
});




//export { SqliteDB, TipitakaQuery, TipitakaQueryType, runServerLocally };
//module.exports = {
//    SqliteDB: SqliteDB,
//};

/**
 * backend for the full text search - this would load data from the sqlite db and search for matches
 * according to the query passed in by the user. 
 * This code would run in node (website and laptop) or in browser (in case of android apps).
 * runServerLocally variable is used to control those 2 cases
 */
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
                    match[2][file].push(offsets);
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
            });
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
        const ms = await ftsServer.runQuery(this.query);
        return { query: ms.query, wordInfo: ms.wordInfo, matches: ms.matches, stats: ms.stats };
    }
    checkQuery() {
        const { type, terms, params } = this.query; // destructure object
        if (!terms || !terms.length || terms.some(t => !t)) throw new Error(`Query terms all or some empty`);
        terms.forEach(term => {
            try { } catch(e) {
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
class DictionaryServer {
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
                this.loadedDicts.set(dictName, new DictionaryDb(dictName));
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
class DictionaryQuery {
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

// this gives the script directory or the binary directory in both of the cases above
const checkDirList = [process.cwd(), path.dirname(process.execPath), path.dirname(process.argv[1])];
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

    let jsonRes;
    try {
        const query = JSON.parse(req.body);
        let tQuery;
        if (query.type == TipitakaQueryType.FTS) {
            tQuery = new FTSQuery(query);
        } else if (query.type == TipitakaQueryType.DICT) {
            tQuery = new DictionaryQuery(query);
        } else {
            throw Error(`Unhandled query type ${query.type}`);
        }
        jsonRes = await tQuery.runQuery();
    } catch (err) {
        console.error(`Sending error response: ${err}`);
        jsonRes = { error: err.message };
    }
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
    if (process.argv[2] != '--no-open') { // in linux this results in an error
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
