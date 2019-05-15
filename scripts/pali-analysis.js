"use script";

import { appSettings, LangHelper, UT, PT, PT_REFRESH, SearchType } from './settings.js';

class PaliAnalysis {
    constructor() {
        this.openWindows = new Map();
        this.settings = { hoverDelay: 500 };
        this.hoverTimer = null;
    }
    init(vManager, dictClient, loadLookupCb) {
        this.vManager = vManager;
        this.dictClient = dictClient;
        this.loadLookupCb = loadLookupCb;
    }
    async showWindow(wordEvent) {
        const target = $(wordEvent.currentTarget);
        const pane = this.vManager.curPane;
        this.closeWindow(pane);  // close any existing windows on this pane
        const newWindow = await this.createAnalysisWindow(target.text(), pane);
        $(this.vManager.getPaneRoot(pane)).append(newWindow);
        this.openWindows.set(pane, [newWindow, target]);
        target.addClass('highlighted').get(0).scrollIntoView({block: 'center'});
        this.registerClicks(newWindow);
    }
    async createAnalysisWindow(word, pane) {
        const wordElem = PT(word).addClass('word');// $(`<span class="word PT">${word}</span>`);//.addClass('word').text(text);
        const lookupIcons = Object.entries(appSettings.searchTypeProp).map(([type, prop]) => {
            return $(`<i class="${prop.iconClass} lookup-icon" word="${word}" type="${type}"></i>`);
        });
        const closeIcon = $('<i class="far fa-times-circle close-icon"></i>').attr('pane', pane);
        const headerRow = $('<div/>').addClass('header').append(lookupIcons, wordElem, closeIcon); 
        
        const breakup = $('<div/>').addClass('breakup').text('breakup - coming soon');
        const declension = $('<div/>').addClass('declension').text('declension - coming soon');
        const dictEntries = await this.dictClient.searchWordInline(word);
        const dictElem = $('<div/>').append(dictEntries).addClass('dict-inline');
        
        return $('<div/>').addClass('analysis-window').addClass(appSettings.get('analysisStyle'))
            .append(headerRow, breakup, declension, dictElem);
    }
    closeWindow(pane) {
        if (this.openWindows.has(pane)) {
            const [window, target] = this.openWindows.get(pane);
            window.remove();
            target.removeClass('highlighted');
            this.openWindows.delete(pane);
        }
    }
    registerClicks(window) {
        window.on('click', '.lookup-icon', e => {
            const icon = $(e.currentTarget);
            this.loadLookupCb(icon.attr('word'), icon.attr('type'));
        }).on('click', '.close-icon', e => {
            this.closeWindow($(e.currentTarget).attr('pane'));
        });

    }
}

export const paliAnalysis = new PaliAnalysis();