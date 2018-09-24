"use strict";

import { PT, PT_REFRESH, appSettings } from './settings.js';
import { FileDisplay } from './file-display.js';

export class PitakaTabs {
    constructor(elem, tree) {
        this.root = elem;
        this.appTree = tree;
        this.tabs = new Map(); // arry of head and content
        this.files = new Map();
        this.activeTabId = ''; // keep track of active tab
        this.currentView = appSettings.get('tabViewFormat'); // default view - todo get from settings 
        this.heads = $('div.tab-heads', this.root);
        this.contents = $('div.tab-contents', this.root);
        this.heads.add(this.contents).attr('view', this.currentView);
        this.registerClicks();
    }
    registerClicks() {
        this.heads.on('click', '.tab-head', e => {
            this.showTab($(e.currentTarget).attr('tab-id'));
        });
        this.heads.on('click', '.close-icon', e => {
            this.removeTab($(e.currentTarget).parent().attr('tab-id'));
            e.stopPropagation();
        });
    }
    showTab(tabId) {
        if (!this.tabs.has(tabId)) return false;
        this.tabs.forEach(tab => tab.forEach(elem => elem.removeClass('active')));
        this.tabs.get(tabId).forEach(elem => elem.addClass('active'));
        this.activeTabId = tabId;
        return true;
        //this.appTree.openBranch(fileId);
        //document.title = title;
    }
    removeTab(tabId) {
        console.log(tabId);
        if (!this.tabs.has(tabId) || this.tabs.size <= 1) return false;
        this.tabs.get(tabId).forEach(elem => elem.remove());
        this.tabs.delete(tabId);
        this.files.delete(tabId);
        if (this.activeTabId == tabId) this.showTab(this.tabs.keys().next().value); // if deleting the active tab
    }
    newTab(fileId, title, collection, highlight = {}) {
        vManager.showPane('text');
        const tabId = getNewTabId();
        const ptTitle = PT(title.replace(/^[\(\)\d+\s\-\.]+/, ''));
        const headLabel = $('<span/>').append(ptTitle).addClass('head-label');
        const closeIcon = $('<span/>').addClass('close-icon far fa-times');
        const collIcon = PitakaTabs.getCollIcon(fileId, collection);
        const headDiv = $('<div/>').addClass('tab-head').append(collIcon, headLabel, closeIcon).appendTo(this.heads);
        const contentDiv = $('<div/>').addClass('tab-content').appendTo(this.contents);
        headDiv.add(contentDiv).attr('view', this.currentView).attr('file-id', fileId).attr('tab-id', tabId); // set view attr for both head and contents
        const fileDisplay = new FileDisplay(contentDiv, this, fileId, collection, highlight); 
        fileDisplay.load();
        this.tabs.set(tabId, [headDiv, contentDiv]);
        this.files.set(tabId, fileDisplay);
        this.showTab(tabId); // make this the active tab
    }
    changeScript() {
        if (this.tabs.size == 0) return;
        const activeTabHead = this.tabs.get(this.activeTabId)[0];
        PT_REFRESH(activeTabHead);
        this.files.get(this.activeTabId).changeScript();
    }
    changeTextFormat() { // abbre and pageTags - cause text rerender
        this.files.forEach(fd => fd.refresh());
    }
    getNumTabs() {
        return this.tabs.size;
    }
    static getCollIcon(fileId, collection) {
        const cls = collection.n.find(val => val[2] == fileId)[0].charAt(0).toUpperCase();
        return $('<span/>').addClass(cls).addClass('coll-icon').text(cls);
    }
    switchView() {
        this.currentView = (this.currentView == 'tabbed') ? 'columns' : 'tabbed';
        appSettings.set('tabViewFormat', this.currentView);
        $('.tab-content,.tab-head').add(this.heads, this.contents).attr('view', this.currentView);
    }
}
const getNewTabId = () => `id-${Math.floor(Math.random() * 1000000)}`;

function printDebug(str, len) {
    for (let i = 0; i < len; i++) {
        const val = str.charCodeAt(i);
        console.log(val + "   " + ("0000" + (+val).toString(16)).substr(-4));
    }
}

class ViewManager {
    constructor() {
        this.curPane = this.prevPane = '';
        this.registerEvents();
        this.showPane('settings');
    }
    showPane(pane) {
        if (pane == 'back') pane = this.prevPane;
        if (pane) $('div.top-pane').hide();
        if (pane == 'text') $('#text-view-area').show();
        else if (pane == 'settings') $('#settings-area').show();
        else if (pane == 'search') $('#search-area').show();
        else if (pane == 'bookmarks') $('#bookmarks-area').show();
        else if (pane == 'fts') $('#fts-area').show();
        this.prevPane = this.curPane;
        this.curPane = pane;
    }
    registerEvents() {
        $('#settings-button').click(e => this.showPane('settings'));
        $('#text-view-button').click(e => this.showPane('text'));

        $('#menu-toggle').mousedown(function (e) {
            $('#menu-list').animate({height: 'toggle'}, 200);
            e.stopPropagation();
        });
        $('#tree-toggle').mousedown(function(e) {
            $('.pitaka-tree-container').animate({width: 'toggle'}, 250);
            $('.pitaka-tree-container').toggleClass('user-opened');
            e.stopPropagation();
        });
        $('#menu-list, .pitaka-tree-container').mousedown(function(e) {
            e.stopPropagation();
        });
        $('body').mousedown(function() {
            $('#menu-list').animate({height: 'hide'}, 350);
            if ($('.pitaka-tree-container').css('position') == 'absolute') { // hide the tree if it is overlapping
                $('.pitaka-tree-container').animate({width: 'hide'}, 250);
            }
        });
        $('dialog').click(e => { // clicking on the dialog (or backdrop) closes the dialog
            if ($(e.target).is('dialog')) {
                e.target.close('cancelled');
            }
        });
    }
}

export const vManager = new ViewManager();