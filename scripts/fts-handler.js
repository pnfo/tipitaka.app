/**
 * Methods related to preparing the fts query and rendering and fts results
 * This would run in the browser and make calls to fts-runner 
 * that is either in server (node) or running in the browser (offline apps)
 */
"use strict";
import { FTSQT, FTSQuery, FTSResponse } from './fts-runner.js';
import { UT, PT, appSettings } from './settings.js';
import { TextProcessor } from './pali-script.js';
import { vManager } from './pitaka-tabs.js';
import { TSH, SearchFilter, TSE } from "./search-common.js";

// 10 top parents file names start with this regex - add ^ to the front
const fileNameFilter = ['1', 'abcde', '2', '3', 'fghij', '4', '5', 'klmno', '6', 'pqrstuvwxy'];

export class FTSHandler {
    constructor() {
        this.prevTerms = [];
        this.matchesStore = null;
        this.settings = {
            minQueryLength: 3,
            maxMatches: 100,  // search stopped after getting this many matches
            maxFiles: 100, // inside each match how many files
            searchDelay: 400,
        };
        this.requestTimer = '';
        this.options = {exactWord: true, exactPhrase: true, matchOrder: true, wordDistance: 10, 
            maxMatches: this.settings.maxMatches, maxFiles: this.settings.maxFiles };
    }
    init(appTree, appTabs) {
        this.tree = appTree;
        this.tabs = appTabs;

        this.filterParents = appSettings.get('fts-search-filter');
        if (!this.filterParents) {
            this.filterParents = TSH.topParentsInfo.slice(0, -1).map(ar => ar[0]); // defaults
            appSettings.set('fts-search-filter', this.filterParents);
        }
        this.filter = new SearchFilter($('#fts-filter'), TSH.topParentsInfo, this.filterParents, this);
        this.registerClicks();
    }
    registerClicks() {
        $('.option[hide=exactPhrase]').toggleClass('hidden', this.options.exactPhrase); // initial set

        $('#fts-options').on('click', '.check-box', e => {
            const span = $(e.currentTarget).toggleClass('checked');
            this.options[span.attr('param')] = span.hasClass('checked');
            $('.option[hide=exactPhrase]').toggleClass('hidden', this.options.exactPhrase);
            this.scheduleSearchIndex();
        });
        $('#input-word-distance').change(() => {
            const dist = Number($('#input-word-distance').val());
            if (dist <= 0 || dist >= 100) {
                this.setStatus(`Allowed Range for word distance 1 - 99.`);
            } else {
                this.options.wordDistance = dist;
                this.scheduleSearchIndex();
            }
        });
        $('#fts-filter-button').click(e => $('#fts-filter').slideToggle('fast'));
        $('#fts-match-list').on('click', '.search-result', e => {
            this.displayInfo($(e.currentTarget).attr('matchInd'));
        });
    }
    performSearch(e) {
        e.stopPropagation();
        vManager.showPane('fts');
        const termStr = $('.search-bar').val().trim().replace(/\s+/g, ' '); // multiple spaces by 1 space
        if (termStr.length < this.settings.minQueryLength) {
            this.setStatus(`Please enter some more characters to start the searching. Minimum: ${this.settings.minQueryLength}`); //todo string res
            return;
        }
        
        const terms = TextProcessor.convertFromMixed(termStr).split(' '); // convert to sinhala here
        if (!this.checkTerms(terms)) return;
        //this.options.wordDistance = Math.max(terms.length, this.options.wordDistance);
        if (terms.length == this.prevTerms.length && terms.every((term, i) => this.prevTerms[i] == term)) {
            return; // same as prev - check array equal
        }
        this.prevTerms = terms;

        this.scheduleSearchIndex();
    }
    checkTerms(terms) {
        if (!terms || !terms.length || !terms.every(t => /[අ-ෆ]/.exec(t)) ) { // each term should have at least one sinhala char (conso, indept vowel)
            this.setStatus(`Each of the search terms must have at least one character.`);
            return false;
        }
        return true;
    }

    scheduleSearchIndex() {
        if (this.requestTimer) clearTimeout(this.requestTimer);
        this.requestTimer = setTimeout(() => this.searchIndex(), this.settings.searchDelay);
    }

    searchIndex() { // send the query to do the search
        if (!this.checkTerms(this.prevTerms)) return; // changing filter/options at the very beginning
        $('#fts-match-list,#fts-match-info').empty();
        const ftsQ = new FTSQuery(FTSQT.getMatches, this.prevTerms, this.getQueryParams());
        console.log(`sending query with terms ${this.prevTerms} and params ${JSON.stringify(ftsQ.params)}`);
        this.setBusySearching(true); // visual indication of search running
        ftsQ.send().then(mStore => {
            this.matchesStore = mStore;
            console.log(`received mstore with ${mStore.matches.length} matches and ${Object.keys(mStore.wordInfo).length} words`);
            this.setBusySearching(false); // clear visual indication
            this.displayMatches();
        }).catch(reject => {
            this.setBusySearching(false);
            console.error(reject);
        });
    }

    getQueryParams() {
        const params = this.options; // current params from user options
        if (TSH.topParentsInfo.length != this.filterParents.length) { // needed only if filtered
            const fileFilter = []; // get the subset of file filter based on filterParents
            TSH.topParentsInfo.forEach((info, i) => {
                if (this.filterParents.indexOf(info[0]) >= 0) fileFilter.push(fileNameFilter[i]);
            });
            params.filter = fileFilter;
        }
        return params;
    }

    setBusySearching(isSet) {
        $('#fts-area').toggleClass('busy-searching', isSet);
    }

    displayMatches() {
        if (this.matchesStore.isEmpty()) {
            this.setStatus(`Search term did not return any results. Your search term is ${this.prevTerms.join(' ')}.`); //todo
            return;
        }
        $('#fts-match-list').append(this.matchesStore.matches.map(([indexes, freq, fileAr]), matchInd => {
            const entryDiv = $('<div/>').addClass('search-result').attr('matchInd', matchInd);
            indexes.forEach(ind => {
                PT(this.matchesStore.wordInfo[ind][0]).addClass('token').appendTo(entryDiv);
            });
            
            $('<span/>').text(freq).addClass('total-freq').appendTo(entryDiv);
            $('<span/>').text(fileAr.length).addClass('count-files').appendTo(entryDiv);
            return entryDiv;
        }));
        if (this.matchesStore.matches.length < this.settings.maxMatches) {
            this.setStatus(`The number of entries found for your search term ${this.matchesStore.matches.length}`);
        } else {
            this.setStatus(`Number of results found ${this.matchesStore.stats.considered}. Number of results shown ${this.settings.maxMatches}`);
        }
        this.displayInfo(0);
    }
    displayInfo(matchInd) {
        $('#fts-match-list').children().removeClass('selected').filter(`[matchInd=${matchInd}]`).addClass('selected');
        const match = this.matchesStore.matches[matchInd];
        $('#fts-match-info').append(match[2].map(([file, offsetAr, numOffsets], fileInd) => {
            const entryDiv = $('<div/>').addClass('search-result').attr('file', file).attr('fileInd', fileInd);
            
            match[0].forEach(ind => {
                PT(this.matchesStore.wordInfo[ind][0]).addClass('token').appendTo(entryDiv);
            });
            
            $('<span/>').text(numOffsets).addClass('count-files').appendTo(entryDiv);
        })).attr('matchInd', matchInd);
    }

    filterChanged(newFilter) {
        this.filterParents = newFilter;
        appSettings.set('title-search-filter', this.filterParents);
        console.log(newFilter);
        this.scheduleSearchIndex();
    }

    setStatus(text) {
        $('#fts-status', this.root).empty().append(UT(text));
    }
    changeScript() {
    }
    checkInit() {
        new FTSQuery(FTSQT.initData).send();
    }

}

//export const ftsHander = new FTSHandler();