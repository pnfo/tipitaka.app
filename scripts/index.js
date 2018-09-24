//import 'babel-polyfill'; // for internet explorer - use when bundling for production

import { getScriptForCode } from './pali-script.js';
import { appSettings, LangHelper, UT } from './settings.js';
import { PitakaTabs, vManager } from './pitaka-tabs.js';
import { PitakaTree } from './pitaka-tree.js';
import { LinkHandler } from './note-tag.js';
import { TSH } from "./search-common.js";
import { TitleSearch, bookmarks } from './title-search.js';
import { FTSHandler } from './fts-handler.js';
import { Util } from './util.js';

const appTree = new PitakaTree($('.pitaka-tree'));
const appTabs = new PitakaTabs($('.text-section'), appTree);
appTree.initialize(appTabs).done(function() {
    // tree loaded
    LinkHandler.initClipboard();
    LinkHandler.tryStartupLocation(appTree, appTabs);
});
const titleSearch = new TitleSearch($('#search-area'), appTree, appTabs);
const ftsHandler = new FTSHandler();
TSH.init().then(() => {
    $('.search-bar').on('keyup compositionend', e => performSearch(e)); 
    $('.search-bar').focus(e => ftsSelected ? vManager.showPane('fts') : vManager.showPane('search'));
    titleSearch.init();
    bookmarks.init(appTree, appTabs);
    ftsHandler.init(appTree, appTabs);
}).catch(err => {
    console.error(`Title Search Index init failed with error ${err}`);
});

function performSearch(e) {
    if (e) e.stopPropagation();
    const searchBarVal = $('.search-bar').val().trim();
    if (ftsSelected) {
        vManager.showPane('fts');
        ftsHandler.performSearch(searchBarVal);
    } else {
        vManager.showPane('search');
        titleSearch.performSearch(searchBarVal);
    }
    const inputScript = getScriptForCode(searchBarVal ? searchBarVal.charCodeAt(0) : 0);
    $('.search-bar').attr('script', inputScript);
}

// whether to do fts or title search
let ftsSelected = false; // not put in settings - instead user should select on each restart (for perf)
// ftsHandler.checkInit(); // todo remove in prod
function setFtsSelected(state) {
    $('#fts-select-button').toggleClass('active', state).children().toggleClass('fal', !state).toggleClass('fas', state);
    if (ftsSelected = state) ftsHandler.checkInit();
    performSearch();
}
$('#fts-select-button').click(e => setFtsSelected(!ftsSelected));

// populating the settings pane
// Pali Script Changing
const paliScriptSelect = $('#pali-script-select');
appSettings.paliScriptList.forEach((val, lang) => {
    Util.createLanguageSelectOption(lang, val).appendTo(paliScriptSelect);
});
paliScriptSelect.on('click', '.option', e => {
    const option = $(e.currentTarget);
    //if (appSettings.paliScript == option.attr('value')) return; // no change
    console.log(`Pali script changing from ${appSettings.get('paliScript')} to ${option.attr('value')}`);
    appSettings.set('paliScript', option.attr('value'));
    appTree.changeScript(); // all tree item text updated
    appTabs.changeScript(); // check the script of active tab only
    titleSearch.changeScript(); // results, status and filters
    bookmarks.changeScript(); // bookmarks and filters
    ftsHandler.changeScript(); // results, status and filters
}).children(`[value=${appSettings.get('paliScript')}]`).addClass('active');


// UI Language related
appSettings.uiLanguageList.forEach((val, lang) => {
    Util.createLanguageSelectOption(lang, val).appendTo($('#ui-lang-select'));
});
$('#ui-lang-select').on('click', '.option', e => {
    appSettings.set('uiLanguage', $(e.currentTarget).attr('value'));
    LangHelper.changeTranslation(appSettings.get('uiLanguage'));
}).children(`[value=${appSettings.get('uiLanguage')}]`).addClass('active');

function changeTextSize(size) {
    $('html').css('font-size', `${size}px`);
}

function populateFormatSelect(formatList, select, settingName, onChangeCallback) {
    formatList.forEach((format, val) => {
        const span = $('<span/>').append(UT(format[0]));
        const example = $(format[1]).addClass('example');
        $('<div/>').addClass('option').append(span, example).attr('value', val).appendTo(select);
    });
    select.on('click', '.option', e => {
        const val = appSettings.set(settingName, $(e.currentTarget).attr('value'));
        onChangeCallback(val);
    }).children(`[value=${appSettings.get(settingName)}]`).addClass('active');
}
populateFormatSelect(appSettings.footnoteFormatList, $('#footnote-format-select'), 'footnoteFormat', appTabs.changeTextFormat.bind(appTabs));
populateFormatSelect(appSettings.pageTagFormatList, $('#pagetag-format-select'), 'pageTagFormat', appTabs.changeTextFormat.bind(appTabs));
populateFormatSelect(appSettings.textSizeList, $('#text-size-select'), 'textSize', changeTextSize);

$('.custom-radio').on('click', '.option', e => {
    $(e.currentTarget).addClass('active').siblings().removeClass('active');
    if (appTabs.getNumTabs()) { // only if there are text tabs to show
        vManager.showPane('back'); // go back
    }
});

$('#columns-button').click(e => appTabs.switchView());

// apply initial settings
LangHelper.changeTranslation(appSettings.get('uiLanguage'));
changeTextSize(appSettings.get('textSize'));
