"use strict";

import { TextProcessor } from './pali-script.mjs';
import { Language, appSettings, UT, PT } from './settings.js';
import { JHoverDialog } from './util.js';
import { SearchPane } from './search-common.js';

import { DictionaryQuery } from '../misc/server/constants.js';
//const DictionaryQuery = require('../misc/server/constants.js').DictionaryQuery;

/** change the version when a new dict is available so the old one will be deleted and the new one loaded */
const dictionaryList = new Map([
    ['en-buddhadatta', [Language.EN, 'Buddhadatta Concise', {s: 'BU', v: 2, o: 'Projector', n: 20970, g: true}]],
    ['en-nyanatiloka', [Language.EN, 'Nyanatiloka Buddhist', {s: 'ND', v: 1, d: 'Buddhist Dictionary by Ven Nyanatiloka', o: 'pced stardict', g: true}]],
    ['en-pts', [Language.EN, 'PTS', {s: 'PS', v: 1, d: 'Pali Text Society Dictionary', o: 'dpr', g: true}]],
    ['en-dppn', [Language.EN, 'Proper Names', {s: 'PN', v: 1, d: 'Pali Proper Names by G P Malalasekera', o: 'dpr', g: true}]],
    ['en-vri', [Language.EN, 'VRI English', {s: 'VR', v: 2, o: 'cst windows software', g: 'English', n: 13508}]],
    ['en-critical', [Language.EN, 'Critical PD', {s: 'CR', v: 1, o: 'extracted from https://cpd.uni-koeln.de/', n: 29669, g: true}]],
    
    ['my-u-hoke-sein', [Language.BUR, 'U Hoke Sein', {s: 'HS', v: 3, o: 'pced stardict', n: 60695, g: true}]], 
    ['my-23-vol', [Language.BUR, 'Abhidhāna', {s: 'AB', v: 2, o: 'pced stardict', g: true}]],
    ['my-android', [Language.BUR, 'Android App', {s: 'AA', v: 1, o: 'Pali Myanmar Dictionary Android App', g: true}]],
    
    ['si-buddhadatta', [Language.SI, 'පොල්වත්තේ බුද්ධදත්ත', {s: 'BU', v: 2, d: 'පොල්වත්තේ බුද්ධදත්ත හිමි, පාලි-සිංහල අකාරාදිය', g: true}] ],
    ['si-sumangala', [Language.SI, 'මඩිතියවෙල සුමඞ්ගල', {s: 'MS', v: 3, d: 'මඩිතියවෙල සිරි සුමඞ්ගල හිමි, පාලි-සිංහල ශබ්දකෝෂය', g: true}] ],
    
    ['th-etipitaka', [Language.THAI, 'E-Tipitaka', {s: 'ET', v: 2, o: 'e tipitaka windows software', g: true}] ],
    ['th-aj-subhira', [Language.THAI, 'สุภีร์ ทุมทอง', {s: 'SU', v: 2, o: 'Ven Buja', g: true}] ],
    ['th-thaiware', [Language.THAI, 'Thai Ware', {s: 'TW', v: 2, o: 'tware windows software', g: true}] ],
    ['th-dhamma-cheti-1', [Language.THAI, 'กิริยากิตก์ฉบับธรรมเจดีย์', {s: 'DC1', v: 1, o: 'online pdf', n: 5922, g: true}] ], // TODO combine 1 & 2
    ['th-dhamma-cheti-2', [Language.THAI, 'กิริยาอาขยาตฉบับธรรมเจดีย์', {s: 'DC2', v: 1, o: 'online pdf', n: 4272, g: true}] ],
    ['th-bhumibol', [Language.THAI, 'PTS Bhumibol', {s: 'BB', v: 1, o: 'online pdf', n: 16143, g: true}] ],
    
    ['ch-suttacentral', [Language.CHINESE, 'SC Chinese', {s: 'SC', v: 2, d: 'SuttaCentral Chinese Dictionary', o: 'Projector'}]],
    ['hi-vri', [Language.HI, 'VRI Hindi', {s: 'VR', v: 2, o: 'cst windows software', n: 16183}]],
    ['in-suttacentral', [Language.INDO, 'SC Indonesian', {s: 'SC', v: 2, o: 'Projector'}]],
    ['es-marco', [Language.ES, 'Marco A', {s: 'ES', v: 1, o: 'SuttaCentral'}]],
    ['pt-marco', [Language.PT, 'Marco A', {s: 'PT', v: 1, o: 'SuttaCentral'}]],
    ['kh-glossary', [Language.KM, 'Glossary App', {s: 'GA', v: 1, o: 'Pali-Khmer Glossary Windows App v1.0', n: 14391}]],
]);


/** Send requests to the server to search dictionaries */
export class DictionaryClient extends SearchPane {
    constructor() {
        super($('#dict-area'), $('#dict-status'));
        this.dictionaryList = dictionaryList;
        this.activeDicts = new Set(appSettings.get('dictList')); 
        this.settings = {
            minQueryLength: 2, // num consos
            maxMatches: 100,  // only up to this many results are requested
            maxMatchesInline: 10, 
            searchDelay: 400,
        };
        this.requestTimer = '';
        this.prevWordSinh = '';
        this.prevWord = '';
        this.registerEvents(); // for events on the results view
    }
    
    // used to set the dictionaries based on the GPS country
    setDictionariesByLanguage(lang) {
        console.log(`Setting dictionaries based on the language ${lang}`);
        this.dictionaryList.forEach((info, dictName) => {
            if (info[0] == lang) 
                this.activeDicts.add(dictName);
        });
        appSettings.set('dictList', Array.from(this.activeDicts));
    }

    dictionaryListChanged(dictName) {
        //const dictName = $(e.currentTarget).attr('value');
        if (this.activeDicts.has(dictName)) {
            this.activeDicts.delete(dictName);
            appSettings.set('dictList', Array.from(this.activeDicts));
            console.log(`Dictionary ${dictName} removed. New List: ${appSettings.get('dictList')}`);
        } else {
            this.activeDicts.add(dictName);
            appSettings.set('dictList', Array.from(this.activeDicts));
            console.log(`Dictionary ${dictName} added. New List: ${appSettings.get('dictList')}`);
        }
        this.scheduleSearchIndex();
    }

    performSearch(searchBarVal) {
        // multiple spaces by 1 space, all non-wild chars removed
        // allowed wild chars % and _ (sqlite LIKE query)
        const word = SearchPane.normalizeSearchTerm(searchBarVal);
        const wordSinh = TextProcessor.convertFromMixed(word); // convert to sinhala here
        if (!this.checkMinQueryLength(wordSinh)) return;
        
        if (wordSinh == this.prevWordSinh) {
            return; // same as prev - check array equal
        }
        this.prevWordSinh = wordSinh;
        this.prevWord = word;

        this.scheduleSearchIndex();
    }

    scheduleSearchIndex() {
        if (this.requestTimer) clearTimeout(this.requestTimer);
        this.requestTimer = setTimeout(() => this.searchWord(), this.settings.searchDelay);
    }

    async searchWord() {
        this.setBusySearching(true); // visual indication of search running
        const response = await this.queryWord(this.prevWordSinh, this.settings.maxMatches);
        this.setBusySearching(false);
        if (response) { // in case server error
            this.displayResponse(response);
        }
    }

    async searchWordInline(word) {
        word = TextProcessor.convertFromMixed(word); // convert to sinhala before searching
        const response = await this.queryWord(word, this.settings.maxMatchesInline);
        return { matches: this.renderMatches(response.matches), breakups: this.renderBreakups(response.breakups) };
    }

    /* search the active dicts */
    async queryWord(word, limit) {
        const query = {type: 'dict', word: word, dictionaries: Array.from(this.activeDicts), limit };
        const tQuery = new DictionaryQuery(query);
        console.log(`sending query with terms ${word} and params ${JSON.stringify(query)}`);
        const response = await tQuery.runQuery();
        if (response.error) {
            this.setStatus(UT(response.error), 'error-status'); // some server error
            console.error(response.error);
            return false;
        }
        console.log(`received ${response.matches.length} matches for word ${word}`);
        return response;
    }

    displayResponse(response) {
        $('#dict-results', this.root).html(this.renderMatches(response.matches));
        $('#word-breakup', this.root).html(this.renderBreakups(response.breakups));
        if (!response.matches.length) {
            this.setStatus(UT('no-results-found', this.prevWord));
        } else if (response.matches.length < this.settings.maxMatches) {
            this.setStatus(UT('number-of-results-found', response.matches.length));
        } else {
            this.setStatus(UT('too-many-results-found', this.settings.maxMatches)); 
        }
    }

    renderMatches(matches) {
        const script = appSettings.get('paliScript');
        return matches.map(match => {
            const dictInfo = this.dictionaryList.get(match.dictName);
            const sDict = $('<span/>').addClass('dict-cell dict-name').text(dictInfo[2].s).attr('dict-name', match.dictName);
            const sWord = PT(match.word).addClass('dict-cell dict-word pali-analysis');//$('<span/>').addClass('dict-cell dict-word PT pali-analysis').text(TextProcessor.convert(match.word, script)).attr('script', script);
            const sMeaning = $('<span/>').addClass('dict-cell dict-meaning UT').html(match.meaning).attr('lang', dictInfo[0]);
            return $('<div/>').append(sDict, sWord, sMeaning).addClass('dict-row');
        });
    }
    renderBreakups(breakups) {
        return breakups.map(breakup => {
            const word = PT(breakup.word).addClass('word pali-analysis');
            const type = PT(breakup.type).addClass('type');
            const subs = $('<span/>').addClass('subs').html(JSON.parse(breakup.breakstr).map(sub => {
                return $('<span/>').addClass('sub').html(PT(sub[0])).attr('similarity', sub[1]); // TODO
            }));
            return $('<div/>').append(word, type, subs).addClass('row');
        });
    }

    /* called only once - for dict-name hover and abbreviations hover */
    registerEvents() {
        $(document).on('click', '.dict-name', e => {
            const dElem = $(e.currentTarget);
            JHoverDialog.create('dict-name', 100, dElem, () => this.getDictHoverContents(dElem));
        }).on('mouseleave', '.dict-name', e => JHoverDialog.destroy('dict-name'));
        /*$(document).on('mouseenter', '.dict-name', e => {
            const dElem = $(e.currentTarget);
            JHoverDialog.create('dict-name', 300, dElem, () => this.getDictHoverContents(dElem));
        }).on('mouseleave', '.dict-name', e => JHoverDialog.destroy('dict-name'));*/
        $('#dict-filter-button').click(e => $('#dict-filter').slideToggle('fast'));
    }
    getDictHoverContents(dElem) {
        const dictInfo = this.dictionaryList.get(dElem.attr('dict-name'));
        return $('<div/>').addClass('dict-desc UT').attr('lang', dictInfo[0]).text(dictInfo[1]);
    }
}

export const dictClient = new DictionaryClient();