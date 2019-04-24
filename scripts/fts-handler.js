/**
 * Methods related to preparing the fts query and rendering and fts results
 * This would run in the browser and make calls to fts-runner 
 * that is either in server (node) or running in the browser (offline apps)
 */
"use strict";

import { UT, PT, PT_REFRESH, appSettings } from './settings.js';
import { TextProcessor } from './pali-script.mjs';
import { PitakaTree } from "./pitaka-tree.js";
import { TSH, SearchFilter, TSE } from "./search-common.js";

const FTSRunLocally = false; // uncomment the following when run locally
//import { FTSQuery } from './fts-runner.mjs';

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
        this.appTree = appTree;
        this.appTabs = appTabs;

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
        // multiple spaces by 1 space, other non-regex chars removed by tokenizer also removed (so user can directly copy paste terms)
        const termStr = searchBarVal.replace(/\s+/g, ' ').replace(/[\d\,!;"‘’“”–<>=\:]/g, '');
        if (termStr.length < this.settings.minQueryLength) {
            this.setStatus(UT('enter-more-characters', this.settings.minQueryLength));
            //this.setStatus(`Please enter minimun XXX characters to start the searching. Minimum: ${this.settings.minQueryLength}`); //todo string res
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
            this.setStatus(UT('fts-search-term-one-char'));
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

        const query = {type: 'get-matches', terms: this.prevTerms, params: this.getQueryParams() };
        const ftsQ = FTSRunLocally ? new FTSQuery(query) : new RemoteFTSQuery(query);
        console.log(`sending query with terms ${this.prevTerms} and params ${JSON.stringify(ftsQ.params)}`);
        this.setBusySearching(true); // visual indication of search running
        ftsQ.send().then(mStore => {
            this.matchesStore = mStore;
            console.log(`received mstore with ${mStore.matches.length} matches and ${Object.keys(mStore.wordInfo).length} words`);
            this.setBusySearching(false); // clear visual indication
            this.displayMatches();
        }).catch(reject => {
            this.setBusySearching(false);
            this.setStatus(UT(reject.message));
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
        } else {
            params.filter = null; // clear so that filter will not tried to be applied
        }
        return params;
    }

    setBusySearching(isSet) {
        $('#fts-area').toggleClass('busy-searching', isSet);
    }

    displayMatches() {
        if (this.matchesStore.matches.length == 0) {
            this.setStatus(UT('no-results-found', this.prevTerms.join(' ')));
            return;
        }
        $('#fts-match-list').append(this.matchesStore.matches.map(([indexes, freq, fileAr, numFiles], matchInd) => {
            const entryDiv = $('<div/>').addClass('search-result').attr('matchInd', matchInd);
            indexes.forEach(ind => {
                PT(this.matchesStore.wordInfo[ind][0]).addClass('token').appendTo(entryDiv);
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
            const tsEntry = TSH.data[TSH.fileToTSI.get(file)];
            tsEntry[TSE.parents].forEach(ind => {
                PT(TSH.data[ind][TSE.name]).addClass('parent name').attr('index', ind).appendTo(entryDiv);
                $('<i/>').text(' » ').appendTo(entryDiv);
            });
            PT(tsEntry[TSE.name]).addClass('child name').attr('index', tsEntry[TSE.id]).appendTo(entryDiv);
            $('<span/>').text(numOffsets).addClass('count-files').appendTo(entryDiv);
            return entryDiv;
        })).attr('matchInd', matchInd);
    }

    openResult(e) {
        const nameDiv = $(e.currentTarget);
        const entry = TSH.data[nameDiv.attr('index')];
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

    setStatus(tElem) {
        $('#fts-status', this.root).empty().append(tElem);
    }
    changeScript() {
        PT_REFRESH($('#fts-area'));
    }
    async checkInit() {
        if (FTSRunLocally) {
            await new FTSQuery({type: 'init-data'}).send();
        }
    }

}

/**
 * Used when the FTS query is run on a remote server
 */
const FTSServerURLEndpoint = 'https://tipitaka.app/nodejs/fts-query/';
class RemoteFTSQuery {
    constructor(obj) {
        this.type = obj.type;
        this.terms = obj.terms;
        this.params = obj.params;
    }
    async send() {
        const queryObj = { type: this.type, terms: this.terms, params: this.params };
        const responseObj = await $.post(FTSServerURLEndpoint, JSON.stringify(queryObj));
        if (responseObj.error) {
            throw new Error(responseObj.error);
        }
        return responseObj;
    }
}