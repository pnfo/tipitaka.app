/**
 * Methods related to preparing the fts query and rendering and fts results
 * This would run in the browser and make calls to fts-server 
 * that is either in server (node) or running in the browser (offline apps)
 */
"use strict";

import { UT, PT, appSettings } from './settings.js';
import { TextProcessor } from './pali-script.js';
import { PitakaTree } from "./pitaka-tree.js";
import { titleStorage, SearchFilter, TSE, fileNameFilter, SearchPane } from "./search-common.js";

import { FTSQuery } from '../misc/server/constants.js';
//const FTSQuery = require('../misc/server/constants.js').FTSQuery;

export class FTSClient extends SearchPane {
    constructor() {
        super($('#fts-area'), $('#fts-status'));
        this.prevTermsSinh = [];
        this.matchesStore = null;
        this.settings = {
            minQueryLength: 2,
            maxMatches: 100,  // search stopped after getting this many matches
            maxFiles: 100, // inside each match how many files
            searchDelay: 400,
        };
        this.requestTimer = '';
        this.options = {sortByBook: true, exactWord: true, exactPhrase: true, matchOrder: true, wordDistance: 10, 
            maxMatches: this.settings.maxMatches, maxFiles: this.settings.maxFiles };
    }
    init(appTree, appTabs) {
        this.appTree = appTree;
        this.appTabs = appTabs;

        this.filterParents = appSettings.get('fts-search-filter');
        if (!this.filterParents) {
            this.filterParents = titleStorage.topParentsInfo.slice(0, -1).map(ar => ar[0]); // defaults
            appSettings.set('fts-search-filter', this.filterParents);
        }
        this.filter = new SearchFilter($('#fts-filter'), titleStorage.topParentsInfo, this.filterParents, this);
        //$('.option[hide=exactPhrase]').toggleClass('hidden', this.options.exactPhrase); // initial set
        this.registerClicks();
    }
    registerClicks() {
        $('#fts-options').on('click', '.check-box', e => {
            const span = $(e.currentTarget).toggleClass('checked');
            this.options[span.attr('param')] = span.hasClass('checked');
            $('.option[hide=exactPhrase]').toggleClass('hidden', this.options.exactPhrase); // order and distance
            this.scheduleSearchIndex();
        });
        $('#input-word-distance').change(() => {
            const dist = Number($('#input-word-distance').val());
            if (dist <= 0 || dist >= 100) {
                this.setStatus(UT('fts-range-word-distance'));
            } else {
                this.options.wordDistance = dist;
                this.scheduleSearchIndex();
            }
        });
        $('#fts-filter-button').click(e => $('#fts-filter').slideToggle('fast'));
        $('#fts-match-list').on('click', '.search-result', e => {
            this.displayInfo($(e.currentTarget).attr('matchInd'));
        });
        $('#fts-match-info').on('click', 'i.name', e => this.openResult(e));
    }
    performSearch(searchBarVal) {
        // multiple spaces by 1 space, other non-wild chars removed by tokenizer also removed (so user can directly copy paste terms)
        // allowed wild chars % and _ (sqlite LIKE query)
        const termStr = SearchPane.normalizeSearchTerm(searchBarVal);
        
        const termsStrSinh = TextProcessor.convertFromMixed(termStr); // convert to sinhala here
        if (!this.checkMinQueryLength(termsStrSinh)) return;
        const terms = termsStrSinh.split(' ')
        if (!this.checkTerms(terms)) return;

        $('.option[param=exactPhrase]').toggleClass('hidden', terms.length < 2); // this option enabled only if there are more than 1 terms
        $('.option[hide=exactPhrase]').toggleClass('hidden', this.options.exactPhrase || terms.length < 2);
        
        //this.options.wordDistance = Math.max(terms.length, this.options.wordDistance);
        if (terms.length == this.prevTermsSinh.length && terms.every((term, i) => this.prevTermsSinh[i] == term)) {
            return; // same as prev - check array equal
        }
        this.prevTermsSinh = terms;
        this.prevTermsStr = termStr; // for ui display purposes

        this.scheduleSearchIndex();
    }
    checkTerms(terms) {
        if (!terms || !terms.length || !terms.every(t => /[අ-ෆ]/.test(t)) ) { // each term should have at least one sinhala char (conso, indept vowel)
            this.setStatus(UT('fts-search-term-one-char'));
            return false;
        }
        return true;
    }

    scheduleSearchIndex() {
        if (this.requestTimer) clearTimeout(this.requestTimer);
        this.requestTimer = setTimeout(() => this.searchIndex(), this.settings.searchDelay);
    }

    async searchIndex() { // send the query to do the search
        if (!this.checkTerms(this.prevTermsSinh)) return; // changing filter/options at the very beginning
        $('#fts-match-list,#fts-match-info').empty();

        const query = {type: 'fts', terms: this.prevTermsSinh, params: this.getQueryParams() };
        const ftsQ = new FTSQuery(query);
        console.log(`sending query with terms ${query.terms} and params ${JSON.stringify(query.params)}`);
        this.setBusySearching(true); // visual indication of search running
        const response = await ftsQ.runQuery();
        this.setBusySearching(false); // clear visual indication
        if (response.error) {
            this.setStatus(UT(response.error), 'error-status'); // some server error
            console.error(response.error);
            return false;
        }
        this.matchesStore = response;
        console.log(`received mstore with ${response.matches.length} matches and ${Object.keys(response.wordInfo).length} words`);
        this.displayMatches();
    }

    getQueryParams() {
        const params = this.options; // current params from user options
        if (titleStorage.topParentsInfo.length != this.filterParents.length) { // needed only if filtered
            const fileFilter = []; // get the subset of file filter based on filterParents
            titleStorage.topParentsInfo.forEach((info, i) => {
                if (this.filterParents.indexOf(info[0]) >= 0) fileFilter.push(fileNameFilter[i]);
            });
            params.filter = fileFilter;
        } else {
            params.filter = null; // clear so that filter will not tried to be applied
        }
        return params;
    }

    displayMatches() {
        if (this.matchesStore.matches.length == 0) {
            this.setStatus(UT('no-results-found', this.prevTermsStr));
            return;
        }
        $('#fts-match-list').append(this.matchesStore.matches.map(([indexes, freq, fileAr, numFiles], matchInd) => {
            const entryDiv = $('<div/>').addClass('search-result').attr('matchInd', matchInd);
            indexes.forEach(ind => {
                PT(this.matchesStore.wordInfo[ind][0]).addClass('token pali-analysis').appendTo(entryDiv);
            });
            
            $('<span/>').text(freq).addClass('total-freq').appendTo(entryDiv);
            $('<span/>').text(numFiles).addClass('count-files').appendTo(entryDiv);
            return entryDiv;
        }));
        if (this.matchesStore.matches.length < this.settings.maxMatches) {
            this.setStatus(UT('number-of-results-found', this.matchesStore.matches.length));
        } else {
            this.setStatus(UT('fts-too-many-results-found', this.matchesStore.stats.considered, this.settings.maxMatches));
        }
        this.displayInfo(0);
    }

    displayInfo(matchInd) {
        $('#fts-match-list').children().removeClass('selected').filter(`[matchInd=${matchInd}]`).addClass('selected');

        const match = this.matchesStore.matches[matchInd];
        $('#fts-match-info').empty().append(match[2].map(([file, offsetAr, numOffsets], fileInd) => {
            const entryDiv = $('<div/>').addClass('search-result').attr('file', file).attr('fileInd', fileInd);
            const tsEntry = titleStorage.data[titleStorage.fileToTSI.get(file)];
            tsEntry[TSE.parents].forEach(ind => {
                PT(titleStorage.data[ind][TSE.name]).addClass('parent name').attr('index', ind).appendTo(entryDiv);
                $('<i/>').text(' » ').appendTo(entryDiv);
            });
            PT(tsEntry[TSE.name]).addClass('child name').attr('index', tsEntry[TSE.id]).appendTo(entryDiv);
            $('<span/>').text(numOffsets).addClass('count-files').appendTo(entryDiv);
            return entryDiv;
        })).attr('matchInd', matchInd);
    }

    openResult(e) {
        const nameDiv = $(e.currentTarget);
        const entry = titleStorage.data[nameDiv.attr('index')];
        const fileId = entry[TSE.file];
        if (nameDiv.parent().attr('file') != fileId) { // different file will be opened
            return; // for now do nothing
        }
        const coll = this.appTree.getCollection(fileId);
        const newT = PitakaTree.filterCollection(coll, fileId);

        const matchInd = nameDiv.parents('[matchInd]').first().attr('matchInd');
        const match = this.matchesStore.matches[matchInd];
        const highlightWords = match[0].map(ind => this.matchesStore.wordInfo[ind][0]);

        const fileInd = nameDiv.parent().attr('fileInd');
        const offsetAr = match[2][fileInd][1];

        this.appTabs.newTab(fileId, newT[1], coll, { words: highlightWords, offsets: offsetAr } );
        this.appTree.openBranch(fileId);
    }

    filterChanged(newFilter) {
        this.filterParents = newFilter;
        appSettings.set('fts-search-filter', this.filterParents);
        console.log(`fts filter changing to ${this.filterParents}`);
        this.scheduleSearchIndex();
    }
}