"use strict";
import { TextProcessor } from "./pali-script.js";
import { PT, PT_REFRESH, UT, appSettings } from "./settings.js";
import { PitakaTree } from "./pitaka-tree.js";
import { vManager } from "./pitaka-tabs.js";

// store the data in local browser cache - will be available even after browser restart

class LocalStorageHelper {
    constructor(name, url, version) {
        this.name = name;
        this.dataUrl = url;
        this.version = version;
        this.data = [];
        this.topParentsInfo = []; // todo move to subclass
    }
    init() {
        const def = $.Deferred();
        // first load whatever data available in storage
        if (this.version != localStorage.getItem(`version_${this.name}`) || !this.getLocalData(def)) {
            this.loadUrlData(def);
        }
        def.done(() => { // todo move to sub class
            this.data.forEach(entry => {
                if (!entry[SL.parents].length) 
                    this.topParentsInfo.push([entry[SL.id], entry[SL.name]]);
            });
        });
        return def;
    }

    getLocalData(def) {
        const dataStr = localStorage.getItem(this.name);
        if (!dataStr) {
            console.log(`no data in storage for ${this.name}`);
            return false;
        }
        this.data = JSON.parse(LZString.decompressFromUTF16(dataStr));
        console.log(`${this.name} loaded of length ${this.data.length} from local storage.`);
        def.resolve(this.name, this.version); // params passed to done function
        return true;
    }
    
    // whatever the version given would be marked as the version of the loaded data
    loadUrlData(def) {
        $.getJSON(this.dataUrl).done(data => {
            this.data = data;
            def.resolve(this.name, this.version); // params passed to done function
            // compress and put in local storage
            const uncompressed = JSON.stringify(this.data);
            const compressed = LZString.compressToUTF16(uncompressed);
            try {
                localStorage.setItem(this.name, compressed);
                console.log(`Stored data of length ${compressed.length} to local storage. Uncompressed length ${uncompressed.length}`);
                localStorage.setItem(`version_${this.name}`, this.version);
            } catch(domException) {
                console.error(`Failed to set ${this.name} of size ${compressed.length} to local storage ${domException}`);
            }
        }).fail(name => {
            def.reject(`Failed to load the ${this.name}. Please check your internet connection`); // TODO add to string resources.
        });
    }
}

class SearchFilter {
    constructor(root, topParentsInfo, defaultFilter, cbObj) {
        this.root = root;
        this.topParentsInfo = topParentsInfo;
        this.cbObj = cbObj;
        this.filter = new Map(); defaultFilter.forEach(id => this.filter.set(id, 1));
        this.render();
        this.registerClicks();
    }
    render() {
        this.table = $('<table/>').addClass('filter-table').appendTo(this.root);
        console.log(this.topParentsInfo);
        [0, 1, 2].forEach(row => {
            const tr = $('<tr/>').attr('row', row).appendTo(this.table);
            [0, 1, 2].forEach(column => {
                const info = this.topParentsInfo[column * 3 + row];
                this.renderCheckBox(info[SL.id], info[SL.name], row, column).appendTo(tr);
            });
        });
        const anya = this.renderCheckBox(this.topParentsInfo[9][SL.id], this.topParentsInfo[9][SL.name], 3, 0).attr('colspan', 3);
        $('<tr/>').attr('row', 3).append(anya).appendTo(this.table);
    }
    renderCheckBox(id, label, row, column) {
        return $('<td/>').html(PT(label)).attr('row', row).attr('column', column).attr('value', id)
            .toggleClass('checked', this.filter.has(id));

    }
    registerClicks() {
        this.table.on('click', 'td', e => {
            const td = $(e.currentTarget).toggleClass('checked');
            if (td.hasClass('checked')) {
                this.filter.set(Number(td.attr('value')), 1);
            } else {
                this.filter.delete(Number(td.attr('value')));
            }
            this.cbObj.filterChanged(Array.from(this.filter.keys()));
        });
    }
}

// search index fields - copied from the title-search-index.js
const SL = Object.freeze({
    id: 0,
    name: 1,
    type: 2,
    parents: 3,
    file: 4,
    lineInd: 5,
});

const currentTitleIndexVer = '2.0';
const IS = new LocalStorageHelper('title-index', './static/json/title-search-index.json', currentTitleIndexVer);

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
        return IS.init().done((name, ver) => {
            // setup filter
            this.filterParents = appSettings.get('title-search-filter');
            if (!this.filterParents) {
                this.filterParents = IS.topParentsInfo.slice(0, -1).map(ar => ar[0]); // defaults
                appSettings.set('title-search-filter', this.filterParents);
            }
            this.filter = new SearchFilter($('#search-filter'), IS.topParentsInfo, this.filterParents, this);

            // register search related click events
            this.registerClicks();
            // update the UI to indicate data has finished loading
            console.log(`search index loaded with length ${IS.data.length}, version: ${ver}`);
        }).fail(msg => {
            //alert(msg);
        });
    }

    registerClicks() {
        $('.search-bar').on('keyup compositionend', e => this.performSearch(e)); // TODO: give focus to the search bar on page load
        $('#search-filter-button').click(e => $('#search-filter').slideToggle('fast'));
        // clicking on a result opens it up in the tabs
        $('#search-results').on('click', 'i.name', e => TitleSearch.openResult(e, this.tree, this.tabs));
    }

    static openResult(e, appTree, appTabs) {
        const entry = IS.data[$(e.currentTarget).attr('index')];
        const fileId = entry[SL.file];
        const coll = appTree.getCollection(fileId);
        const newT = PitakaTree.filterCollection(coll, fileId);
        appTabs.newTab(fileId, newT[1], coll, Number(entry[SL.lineInd]));
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
        return queryReg.exec(entry[SL.name]) && 
            (this.filterParents.length == IS.topParentsInfo.length || this.filterParents.indexOf(entry[SL.parents][0]) >= 0);
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
        for (let i = 0; i < IS.data.length; i++) {
            if (this.checkQuery(IS.data[i], queryReg)) results.push(i);
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
            const entry = IS.data[v];
            const entryDiv = $('<div/>').addClass('search-result').attr('index', v);
            entry[SL.parents].forEach(p => {
                PT(IS.data[p][SL.name]).addClass('parent name').attr('index', p).appendTo(entryDiv);
                $('<i/>').text(' » ').appendTo(entryDiv);
            });
            PT(entry[SL.name]).addClass('child name').attr('index', v).appendTo(entryDiv);
            bookmarks.getIcon(entry[SL.file], entry[SL.lineInd]).appendTo(entryDiv);
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
            this.filterParents = IS.topParentsInfo.map(ar => ar[0]);  // defaults - all
            appSettings.set('bookmarks-filter', this.filterParents);
        }
        
        this.filter = new SearchFilter($('#bookmarks-filter'), IS.topParentsInfo, this.filterParents, this);
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
        IS.data.forEach(entry => {
            const key = `${entry[SL.file]},${entry[SL.lineInd]}`;
            if (this.list[key] && this.checkFilter(entry)) {
                indexes.push(entry[SL.id]);
            }
        });
        resultsDiv.append(TitleSearch.createResultsList(indexes));
        this.setStatus(`The number of bookmarks found matching your filter ${indexes.length}`);
    }
    checkFilter(entry) {
        return this.filterParents.length == IS.topParentsInfo.length || this.filterParents.indexOf(entry[SL.parents][0]) >= 0;
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

