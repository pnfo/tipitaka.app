"use strict";

import { TextProcessor } from './pali-script.mjs';
import { Language, appSettings, UT } from './settings.js';
import { Util, JHoverDialog, JDialog } from './util.js';

/** change the version when a new dict is available so the old one will be deleted and the new one loaded */
const dictionaryList = new Map([
    ['en-buddhadatta', [Language.EN, 'Buddhadatta Concise', {s: 'BU', v: 2, o: 'Projector', n: 20970}]],
    ['en-nyanatiloka', [Language.EN, 'Nyanatiloka Buddhist', {s: 'ND', v: 1, d: 'Buddhist Dictionary by Ven Nyanatiloka', o: 'pced stardict'}]],
    ['en-pts', [Language.EN, 'PTS', {s: 'PS', v: 1, d: 'Pali Text Society Dictionary', o: 'dpr'}]],
    ['en-dppn', [Language.EN, 'Proper Names', {s: 'PN', v: 1, d: 'Pali Proper Names by G P Malalasekera', o: 'dpr'}]],
    ['en-vri', [Language.EN, 'VRI English', {s: 'VR', v: 2, o: 'cst windows software'}]],
    ['en-critical', [Language.EN, 'Critical PD', {s: 'CR', v: 1, o: 'extracted from https://cpd.uni-koeln.de/'}]],
    ['my-u-hoke-sein', [Language.BUR, 'U Hoke Sein', {s: 'HS', v: 3, o: 'pced stardict', n: 60695}]], 
    ['my-23-vol', [Language.BUR, '23 Vol', {s: '23', v: 2, o: 'pced stardict'}]],
    ['si-buddhadatta', [Language.SI, 'පොල්වත්තේ බුද්ධදත්ත', {s: 'BU', v: 2, d: 'පොල්වත්තේ බුද්ධදත්ත හිමි, පාලි-සිංහල අකාරාදිය'}] ],
    ['si-sumangala', [Language.SI, 'මඩිතියවෙල සුමඞ්ගල', {s: 'MS', v: 3, d: 'මඩිතියවෙල සිරි සුමඞ්ගල හිමි, පාලි-සිංහල ශබ්දකෝෂය'}] ],
    ['th-etipitaka', [Language.THAI, 'E-Tipitaka', {s: 'ET', v: 2, o: 'e tipitaka windows software'}] ],
    ['th-aj-subhira', [Language.THAI, 'สุภีร์ ทุมทอง', {s: 'SU', v: 2, o: 'Ven Buja'}] ],
    ['th-thaiware', [Language.THAI, 'Thai Ware', {s: 'TW', v: 2, o: 'tware windows software'}] ],
    ['th-dhamma-cheti-1', [Language.THAI, 'กิริยากิตก์ฉบับธรรมเจดีย์', {s: 'DC1', v: 1, o: 'online pdf', n: 5922}] ],
    ['th-dhamma-cheti-2', [Language.THAI, 'กิริยาอาขยาตฉบับธรรมเจดีย์', {s: 'DC2', v: 1, o: 'online pdf', n: 4272}] ],
    ['ch-suttacentral', [Language.CHINESE, 'SC Chinese', {s: 'SC', v: 2, d: 'SuttaCentral Chinese Dictionary', o: 'Projector'}]],
    ['hi-vri', [Language.HI, 'VRI Hindi', {s: 'VR', v: 2, o: 'cst windows software'}]],
    ['in-suttacentral', [Language.INDO, 'SC Indonesian', {s: 'SC', v: 2, o: 'Projector'}]],
    ['es-marco', [Language.ES, 'Marco A', {s: 'ES', v: 1, o: 'SuttaCentral'}]],
    ['pt-marco', [Language.PT, 'Marco A', {s: 'PT', v: 1, o: 'SuttaCentral'}]],
    ['kh-glossary', [Language.KM, 'Glossary App', {s: 'GA', v: 1, o: 'Pali-Khmer Glossary Windows App v1.0', n: 14391}]],
]);

/** Loading and searching a single dictionary */
class Dictionary {
    constructor(dbName, dbVersion, dataUrl) {
        this.dataUrl = dataUrl;
        this.dbName = dbName;
        this.dbVersion = dbVersion;
        this.dataLoading = false; // prevent multiple loads

        this.db = new Dexie(this.dbName);
        // dexie requires specifing the schema for all the old versions of the db too
        for (let version = 1; version <= this.dbVersion; version++) {
            this.db.version(version).stores({
                dict: '++id,word'
            });
        }
    }
    async load() {
        const dbSize = await this.db.dict.count();
        if (dbSize > 0 || this.dataLoading) { // loaded or already loading
            console.log(`dictionary ${this.dbName}:${this.dbVersion} already in IDB size: ${dbSize}`);
            return true;  
        }
        this.dataLoading = true;
        try {
            let jsonAr = await $.getJSON(this.dataUrl);
            jsonAr = jsonAr.filter(([word, meaning]) => word && meaning); // filter out any empty ones
            console.log(`${this.dbName} loaded from url of size ${jsonAr.length}`);
            await this.db.dict.bulkAdd(jsonAr.map(([word, meaning]) => {
                return {word, meaning};
            }));
        } catch (err) {
            console.error(`Failed to load the ${this.dbName} from ${this.dataUrl}. ${err}`);
            return false;
        }
        
        console.log(`${this.dbName}:${this.dbVersion} loaded to IDB size: ${await this.db.dict.count()}`);
        this.dataLoading = false;
        return true;
    }

    async searchWord(word) {
        if (this.dataLoading) return []; // still loading
        let matches = await this.db.dict.where('word').equals(word).limit(10).toArray();
        if (!matches.length) {
            const stripEnd = word.replace(/[\u0DCA-\u0DDF\u0D82\u0D83]$/g, '');
            matches = await this.db.dict.where('word').startsWith(stripEnd).limit(maxIDBResults).toArray();
        }
        return matches;
    }
    async clearDb() {
        await this.db.dict.clear();
    }
}


const maxIDBResults = 10;
const dictDataFileFolder = './static/dicts';
/** Loading searching dictionaries based on the user input */
class DictionaryHandler {
    constructor() {
        this.dictionaryList = dictionaryList;
        this.loadedDicts = new Map();
        this.activeDicts = new Set(appSettings.get('dictList')); 
        Array.from(this.activeDicts).forEach(dict => this.loadDictionary(dict)); // creating a new array since we will mutate activeDicts
        this.registerEvents(); // for events on the results view
    }

    /* Load dict if not already loaded */
    async loadDictionary(dictName) {
        if (this.loadedDicts.has(dictName)) return true; //already loaded
        if (this.dictionaryList.has(dictName)) { 
            const dictInfo = this.dictionaryList.get(dictName);
            const newDict = new Dictionary(dictName, dictInfo[2].v, `${dictDataFileFolder}/${dictName}.json`);
            if (await newDict.load()) {
                this.loadedDicts.set(dictName, newDict);
                return true;
            }
        }
        // not found (in case dict name changes) or if load failed (e.g. dict file not found)
        this.activeDicts.delete(dictName);
        appSettings.set('dictList', Array.from(this.activeDicts));
        console.log(`deleted ${dictName} which failed to load. New list ${appSettings.get('dictList')}`);
        return false;
    }

    dictionaryListChanged(e) {
        const dictName = $(e.currentTarget).attr('value');
        if (this.activeDicts.has(dictName)) {
            this.activeDicts.delete(dictName);
            appSettings.set('dictList', Array.from(this.activeDicts));
            console.log(`Dictionary ${dictName} removed`);
        } else {
            // show loading dialog, and try loading the dict
            const lDlg = new JDialog($(e.currentTarget), '').show(
                $('<div/>').addClass('loading-dlg').append(UT('dictionary-loading')));
            this.loadDictionary(dictName).then(() => {
                lDlg.close(); // clear dialog
                this.activeDicts.add(dictName);
                appSettings.set('dictList', Array.from(this.activeDicts));
                console.log(`Dictionary ${dictName} added: ${appSettings.get('dictList')}`);
            }).catch((err) => {
                lDlg.close(); // clear dialog
                console.error(`Dict ${dictName} loading failed. Error: ${err}`);
            });
        }
    }

    /* search the active dicts */
    async searchWord(word, script) {
        word = TextProcessor.convertFrom(word, script); // convert to sinhala before searching
        //console.log(`searching for word ${word}`);
        console.log(Array.from(this.activeDicts));
        const activeDictsAr = Array.from(this.activeDicts);
        const matchesAr = await Promise.all(activeDictsAr.map(
            dictName => this.loadedDicts.get(dictName).searchWord(word)
        ));
        const matches = [];
        activeDictsAr.forEach((dictName, i) => matches.push(...matchesAr[i].map(match => { 
            match.dictName = dictName;
            match.distance = Util.levenshtein(match.word, word);
            return match; 
        })));
        // sort by edit distance to the input word
        matches.sort((a, b) =>  a.distance - b.distance);
        console.log(matches);
        matches.splice(maxIDBResults);
        return matches.map(match => {
            const dictInfo = this.dictionaryList.get(match.dictName);
            const sDict = $('<span/>').addClass('dict-name').text(dictInfo[2].s).attr('dict-name', match.dictName);
            const sWord = $('<span/>').addClass('dict-word PT').text(TextProcessor.convert(match.word, script)).attr('script', script);
            const sMeaning = $('<span/>').addClass('dict-meaning UT').html(match.meaning).attr('lang', dictInfo[0]);
            return $('<div/>').append(sDict, sWord, sMeaning).addClass('dict-row');
        });
    }

    /* called only once - for dict-name hover and abbreviations hover */
    registerEvents() {
        $(document).on('mouseenter', '.dict-name', e => {
            const dElem = $(e.currentTarget);
            JHoverDialog.create('dict-name', 300, dElem, () => this.getDictHoverContents(dElem));
        }).on('mouseleave', '.dict-name', e => JHoverDialog.destroy('dict-name'));
    }
    getDictHoverContents(dElem) {
        const dictInfo = this.dictionaryList.get(dElem.attr('dict-name'));
        return $('<div/>').addClass('dict-desc UT').attr('lang', dictInfo[0]).text(dictInfo[1]);
    }
}
export const dictHandler = new DictionaryHandler();

const abbr_en_buddhadatta = new Map([
    ['adj.', 'Adjective'],
    ['abs.', 'Absolutive'],
    ['ad.', 'Adverb'],
    ['aor.', 'Aorist'],
    ['cpds.', 'Compounds'],
    ['conj.', 'Conjunction'],
    ['caus.', 'Causative'],
    ['Deno.', 'Denominative verb'],
    ['Des.', 'Desiderative verb'],
    ['f.', 'Feminine'],
    ['m.', 'Masculine'],
    ['nt.', 'Neuter'],
    ['Ger.', 'Gerund'],
    ['intj.', 'Interjection'],
    ['in.', 'Indeclinable'],
    ['inf.', 'Infinitive'],
    ['onom.', 'Onomatopoetic verb'],
    ['pass', 'Passive'],
    ['act.', 'Active'],
    ['pp.', 'Past participle'],
    ['pr.p.', 'Present participle'],
    ['pt.p.', 'Potential participle'],
    ['prep.', 'Preposition'],
    ['pret.', 'Preterit verb'],
    ['3', 'Of the three genders'],
    ['Sin.', 'Singular'],
    ['Pl.', 'Plural'],
    ['Der.', 'Derivative'],
]);

const abbreviations = {};
abbreviations["si-sumangala"] = {
    "පු.ක්‍රි": ["පුබ්බ ක්‍රියා", 0], //pulled up
    "අ": ["අව්‍යය සද්ද", 0],
    "පු": ["පුල්ලිඞ්ගික", "c1"],
    "ඉ": ["ඉත්‍ථි ලිඞ්ගික", "c1"],
    "න": ["නපුංසක ලිඞ්ගික", "c1"],
    "එ": ["එකක නිපාත", 2],
    "දු": ["දුකනිපාත", 2],
    "ත": ["තතිය", 2],
    "නි": ["නිපාත", 2],
    "ප": ["පණ්ණාසක", 2],
    // "දී,නි": ["දීඝ නිකාය", 3], // removed occurances in text
    "ති": ["තිලිඞ්ගික", "c1"],
    "ක්‍රි": ["ක්‍රියා", 0],
    "වි": ["විභාවිනී", 0],
    // "ම.පූ.": ["මනෝරථ පූරණී", 3], // not ocurring in text
    // "සු. වි": ["සුමඞ්ගලවිලාසිනී", 3], // not ocurring in text
    "ව": ["වණ්ණනා", 0],
    "d": ["ධාතු", 0],
    "භු": ["භුවාදිගණය", 4],
    "රු": ["රුධාදිගණය", 4],
    "දි": ["දිවාදිගණය", 4],
    "සු": ["ස්වාදිගණය", 4],
    "කි": ["කියාදිගණය", 4],
    "ත2": ["තනාදිගණය", 4], // duplicate abbre
    "චු": ["චුරාදිගණය", 4],
    "අ2": ["එනම් විකරණය", 5], // duplicate
    "අං": ["එනම් විකරණය", 5],
    "ය": ["එනම් විකරණය", 5],
    "ණු ණ, යිර": ["එනම් විකරණය", 5], // could not find occurances of the below 4 entries - but leave them anyway
    "ණා": ["එනම් විකරණය", 5],
    "ඔ, උණා": ["එනම් විකරණය", 5],
    "ණෙ, ණය": ["එනම් විකරණය", 5]
    // "ත්‍රි. මූ": ["ත්‍රිපිටක මුද්‍රණය", 0] // removed occurances in text
};

var su_otherNotations = {
    "-": ["ආදෙස", 0],
    "‍+": ["එකතු කිරීම", 0],
    "=": ["සමාන", 0],
    ",": ["එම අත්‍ථර්‍", 0],
    ".": ["අන්‍යාත්‍ථර්‍", 0]    
};

abbreviations["si-buddhadatta"] = {
    "පූ.ක්‍රි": ["පූර්ව ක්‍රියා", 0],
    "ක්‍රි.වි": ["ක්‍රියා විශේෂණ", 0],
    "නි": ["නිපාත", 0],
    "පු": ["පුල් ලිඞ්ග", "c1"],
    "ඉ": ["ඉත්‍ථි ලිඞ්ග", "c1"],
    "න": ["නපුංසක ලිඞ්ග", "c1"],
    "3": ["තුන් ලිඟු ඇති", "c1"]
};