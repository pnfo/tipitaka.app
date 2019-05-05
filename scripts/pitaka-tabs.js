"use strict";

import { PT, PT_REFRESH, UT, appSettings } from './settings.js';
import { FileDisplay } from './file-display.js';
import { vManager } from './util.js';

export class PitakaTabs {
    constructor(elem, tree) {
        this.root = elem;
        this.appTree = tree;
        this.tabs = new Map(); // arry of head and content
        this.files = new Map();
        this.activeTabId = ''; // keep track of active tab
        this.heads = $('div.tab-heads', this.root);
        this.contents = $('div.tab-contents', this.root);
        this.setTCView(appSettings.get('tabViewFormat')); // default view
        this.registerEvents();
    }
    registerEvents() {
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
        if (this.curTCView == 'disabled' && this.activeTabId) {
            this.removeTab(this.activeTabId);
        }
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
        headDiv.add(contentDiv).attr('view', this.curTCView).attr('file-id', fileId).attr('tab-id', tabId); // set view attr for both head and contents
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
    setTCView(newView) {
        this.curTCView = newView;
        if (newView == 'disabled') {
            this.tabs.forEach((_1, tabId) => { if (tabId != this.activeTabId) this.removeTab(tabId);  });
        }
        $('.tab-content,.tab-head').add(this.heads, this.contents).attr('view', this.curTCView);
    }
    /*getNewTabId() { // if multi view is disabled replace the active tab
        return this.curTCView == 'disabled' ? this.activeTabId : `id-${Math.floor(Math.random() * 1000000)}`;
    }*/
}
const getNewTabId = () => `id-${Math.floor(Math.random() * 1000000)}`;

function printDebug(str, len) {
    for (let i = 0; i < len; i++) {
        const val = str.charCodeAt(i);
        console.log(val + "   " + ("0000" + (+val).toString(16)).substr(-4));
    }
}