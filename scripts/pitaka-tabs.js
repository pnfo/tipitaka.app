"use strict";

import { FileDisplay, PT_REFRESH } from './file-display.js';

export class PitakaTabs {
    constructor(elem, tree) {
        this.root = elem;
        this.appTree = tree;
        this.tabs = new Map(); // arry of head and content
        this.files = new Map();
        this.activeFileId = ''; // keep track of active tab
        this.heads = $('div.tab-heads', this.root);
        this.contents = $('div.tab-contents', this.root);
        this.registerClicks();
    }
    registerClicks() {
        this.heads.on('click', '.tab-head', e => {
            this.showTab($(e.currentTarget).attr('file-id'));
        });
        this.heads.on('click', '.close-icon', e => {
            this.removeTab($(e.currentTarget).parent().attr('file-id'));
            e.stopPropagation();
        });
    }
    showTab(fileId) {
        if (!this.tabs.has(fileId)) return false;
        this.tabs.forEach(tab => tab.forEach(elem => elem.removeClass('active')));
        this.tabs.get(fileId).forEach(elem => elem.addClass('active'));
        this.activeFileId = fileId;
        //this.appTree.openBranch(fileId);
        //document.title = title;
    }
    removeTab(fileId) {
        if (!this.tabs.has(fileId) || this.tabs.size <= 1) return false;
        this.tabs.get(fileId).forEach(elem => elem.remove());
        this.tabs.delete(fileId);
        this.files.delete(fileId);
        if (this.activeFileId == fileId) this.showTab(this.tabs.keys().next().value); // if deleting the active tab
    }
    newTab(fileId, ptTitle) {
        if (this.tabs.has(fileId)) {
            return this.showTab(fileId);
        }
        const headLabel = $('<span/>').append(ptTitle).addClass('head-label');
        const closeIcon = $('<span/>').addClass('close-icon far fa-times-square');
        const headDiv = $('<div/>').addClass('tab-head').append(headLabel, closeIcon).attr('file-id', fileId).appendTo(this.heads);
        const contentDiv = $('<div/>').addClass('tab-content').attr('file-id', fileId).appendTo(this.contents);
        const fileDisplay = new FileDisplay(contentDiv, fileId); fileDisplay.load();
        this.tabs.set(fileId, [headDiv, contentDiv]);
        this.files.set(fileId, fileDisplay);
        this.showTab(fileId); // make this the active tab
    }
    changeScript() {
        if (this.tabs.size == 0) return;
        const activeTabHead = this.tabs.get(this.activeFileId)[0];
        PT_REFRESH(activeTabHead);
        this.files.get(this.activeFileId).changeScript();
    }
    changeTextFormat() { // abbre and pageTags - cause text rerender
        this.files.forEach(fd => fd.refresh());
    }
    getNumTabs() {
        return this.tabs.size;
    }
}



function printDebug(str, len) {
    for (let i = 0; i < len; i++) {
        const val = str.charCodeAt(i);
        console.log(val + "   " + ("0000" + (+val).toString(16)).substr(-4));
    }
}

//export {PitakaTabs};