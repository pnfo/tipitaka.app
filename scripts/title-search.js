"use strict";
import { TextProcessor } from "./pali-script.js";
import { PT, PT_REFRESH, UT, appSettings } from "./settings.js";
import { PitakaTree } from "./pitaka-tree.js";
import { vManager } from "./pitaka-tabs.js";
import { TSH, SearchFilter, TSE } from "./search-common.js";

export class TitleSearch {
    constructor(root, tree, tabs) {
        this.root = root;
        this.tree = tree;
        this.tabs = tabs;
        
        this.searchPrevQuery = "";
        this.searchCache = new Map();
    
        this.settings = {
            minQueryLength: 2,
            maxResults: 100,  // search stopped after getting this many matches
        };
    }
    init() {
        this.filterParents = appSettings.get('title-search-filter');
        if (!this.filterParents) {
            this.filterParents = TSH.topParentsInfo.slice(0, -1).map(ar => ar[0]); // defaults
            appSettings.set('title-search-filter', this.filterParents);
        }
        this.filter = new SearchFilter($('#search-filter'), TSH.topParentsInfo, this.filterParents, this);

        // register search related click events
        this.registerClicks();
        // update the UI to indicate data has finished loading
        console.log(`search index loaded with length ${TSH.data.length}`);
    }

    registerClicks() {
        //$('.search-bar').on('keyup compositionend', e => this.performSearch(e)); // TODO: give focus to the search bar on page load
        $('#search-filter-button').click(e => $('#search-filter').slideToggle('fast'));
        // clicking on a result opens it up in the tabs
        $('#search-results').on('click', 'i.name', e => TitleSearch.openResult(e, this.tree, this.tabs));
    }

    static openResult(e, appTree, appTabs) {
        const entry = TSH.data[$(e.currentTarget).attr('index')];
        const fileId = entry[TSE.file];
        const coll = appTree.getCollection(fileId);
        const newT = PitakaTree.filterCollection(coll, fileId);
        appTabs.newTab(fileId, newT[1], coll, Number(entry[TSE.lineInd]));
        appTree.openBranch(fileId);
    }

    performSearch(e) {
        e.stopPropagation();
        vManager.showPane('search');
    
        const query = TextProcessor.convertFromMixed($('.search-bar').val()); // convert to sinhala here
        if (query == this.searchPrevQuery) { return; }
    
        $('#search-results', this.root).empty();
        this.searchPrevQuery = query;
        if (query.length < this.settings.minQueryLength) {
            this.setStatus(`Please enter some more characters to start the searching. Minimum: ${this.settings.minQueryLength}`); //todo string res
        } else {
            console.log(`starting the search with query ${query}`);
            const results = this.searchIndex(query);
            this.displayResults(results); // display the results
        }        
    }

    checkQuery(entry, queryReg) {
        return queryReg.exec(entry[TSE.name]) && 
            (this.filterParents.length == TSH.topParentsInfo.length || this.filterParents.indexOf(entry[TSE.parents][0]) >= 0);
    }
    searchIndex(query) {
        //Check if we've searched for this term before - make sure to clear cache when filters change
        if (this.searchCache.has(query)) {
            const results = this.searchCache.get(query);
            console.log(`Results for query ${query} found in cache of length ${results.length}`);
            return results;
        }

        const queryReg = new RegExp(query, "i");
        const results = [];
        for (let i = 0; i < TSH.data.length; i++) {
            if (this.checkQuery(TSH.data[i], queryReg)) results.push(i);
            if (results.length >= this.settings.maxResults) break;
        }
        console.log(`Search for ${query} in index found ${results.length} hits`);
        
        this.searchCache.set(query, results); //Add results to cache
        return results;
    }
    setStatus(text) {
        $('#search-status', this.root).empty().append(UT(text));
    }
    displayResults(results) {
        const resultsDiv = $('#search-results', this.root).empty();
    
        if (!results) {
            this.setStatus('Your search term did not return any results. Please try another term.'); //todo
            return;
        }
        // add results
        resultsDiv.append(TitleSearch.createResultsList(results));
        
        resultsDiv.show();
        if (results.length < this.settings.maxResults) {
            this.setStatus(`The number of entries found for your search term ${results.length}`);
        } else {
            this.setStatus(`Too many results found. Number of results shown ${this.settings.maxResults}`);
        }
    }
    changeScript() {
        PT_REFRESH(this.root);
    }
    filterChanged(newFilter) {
        this.filterParents = newFilter;
        appSettings.set('title-search-filter', this.filterParents);
        console.log(newFilter);
        this.searchCache.clear(); // empty the cache
        const results = this.searchIndex(this.searchPrevQuery);
        this.displayResults(results); // display the results
    }
    static createResultsList(results) {
        return results.map(v => {
            const entry = TSH.data[v];
            const entryDiv = $('<div/>').addClass('search-result').attr('index', v);
            entry[TSE.parents].forEach(p => {
                PT(TSH.data[p][TSE.name]).addClass('parent name').attr('index', p).appendTo(entryDiv);
                $('<i/>').text(' » ').appendTo(entryDiv);
            });
            PT(entry[TSE.name]).addClass('child name').attr('index', v).appendTo(entryDiv);
            bookmarks.getIcon(entry[TSE.file], entry[TSE.lineInd]).appendTo(entryDiv);
            return entryDiv;
        });
    }
}

class Bookmarks {
    constructor() {
        this.list = {} // from fileId,lineInd to timestamp
    }
    init(appTree, appTabs) {
        this.tree = appTree;
        this.tabs = appTabs;
        // load from storage
        const bookmarksStr = localStorage.getItem('bookmarks');
        if (bookmarksStr) this.list = JSON.parse(bookmarksStr);
        this.registerClicks();
        this.updateCount();

        this.filterParents = appSettings.get('bookmarks-filter');
        if (!this.filterParents) {
            this.filterParents = TSH.topParentsInfo.map(ar => ar[0]);  // defaults - all
            appSettings.set('bookmarks-filter', this.filterParents);
        }
        
        this.filter = new SearchFilter($('#bookmarks-filter'), TSH.topParentsInfo, this.filterParents, this);
    }
    registerClicks() { // save-icon click
        $('body').on('click', 'i.save-icon', e => {
            const icon = $(e.currentTarget);
            const key = icon.attr('key');
            if (this.list[key]) {
                icon.removeClass('saved');
                delete this.list[key];
                console.log(`bookmark ${key} deleted`);
            } else {
                icon.addClass('saved');
                this.list[key] = Date.now();
                console.log(`bookmark ${key} added`);
            }
            localStorage.setItem('bookmarks', JSON.stringify(this.list));
            this.updateCount();
        });
        $('#bookmarks-button').click(e => {
            this.renderBookmarks();
            vManager.showPane('bookmarks');
        });
        $('#bookmarks-filter-button').click(e => $('#bookmarks-filter').slideToggle('fast'));
        $('#bookmarks-list').on('click', 'i.name', e => TitleSearch.openResult(e, this.tree, this.tabs));
    }
    updateCount() {
        $('#bookmarks-count').text(Object.keys(this.list).length);
    }
    getIcon(fileId, lineInd) {
        const icon = $('<i/>').addClass('far fa-star save-icon action-icon'), key = `${fileId},${lineInd}`;
        return icon.toggleClass('saved', this.list[key] > 0).attr('key', key);
    }
    renderBookmarks() {
        const resultsDiv = $('#bookmarks-list').empty();
        if (!Object.keys(this.list).length) {
            this.setStatus('You have no bookmarks saved. Click the star icon to save to bookmarks.');
            return;
        }

        const indexes = [];
        TSH.data.forEach(entry => {
            const key = `${entry[TSE.file]},${entry[TSE.lineInd]}`;
            if (this.list[key] && this.checkFilter(entry)) {
                indexes.push(entry[TSE.id]);
            }
        });
        resultsDiv.append(TitleSearch.createResultsList(indexes));
        this.setStatus(`The number of bookmarks found matching your filter ${indexes.length}`);
    }
    checkFilter(entry) {
        return this.filterParents.length == TSH.topParentsInfo.length || this.filterParents.indexOf(entry[TSE.parents][0]) >= 0;
    }
    filterChanged(newFilter) {
        this.filterParents = newFilter;
        appSettings.set('bookmarks-filter', this.filterParents);
        this.renderBookmarks();
    }
    setStatus(text) {
        $('#bookmarks-status').empty().append(UT(text));
    }
    changeScript() {
        PT_REFRESH($('#bookmarks-area'));
    }
}

export const bookmarks = new Bookmarks();

