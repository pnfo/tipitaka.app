"use script";

import { appSettings, LangHelper, UT, PT, PT_REFRESH, SearchType } from './settings.js';
import { TextProcessor } from './pali-script.mjs';

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
        const newWindow = await this.createAnalysisWindow(target.text(), pane);
        this.closeWindow(pane);  // close any existing windows on this pane
        this.openWindow(pane, newWindow, target);
    }

    async createAnalysisWindow(word, pane) {
        const wordElem = PT(TextProcessor.convertFromMixed(word)).addClass('word');// $(`<span class="word PT">${word}</span>`);//.addClass('word').text(text);
        const lookupIcons = Object.entries(appSettings.searchTypeProp).map(([type, prop]) => {
            return $(`<i class="${prop.iconClass} lookup-icon" word="${word}" type="${type}"></i>`);
        });
        const closeIcon = $('<i class="far fa-times-circle close-icon"></i>').attr('pane', pane);
        const headerRow = $('<div/>').addClass('header').append(lookupIcons, wordElem, closeIcon); 
        
        const entries = await this.dictClient.searchWordInline(word);
        const breakup = $('<div/>').addClass('breakups').html(entries.breakups)
        const declension = $('<div/>').addClass('declension').text('declension - coming soon');
        const dictElem = $('<div/>').addClass('dict-inline').html(entries.matches);
        
        return $('<div/>').addClass('analysis-window').addClass(appSettings.get('analysisStyle'))
            .append(headerRow, breakup, declension, dictElem);
    }

    openWindow(pane, newWindow, target) {
        $(this.vManager.getPaneRoot(pane)).append(newWindow);
        this.openWindows.set(pane, [newWindow, target]);
        target.addClass('highlighted').get(0).scrollIntoView({block: 'center'});
        this.registerClicks(newWindow);
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