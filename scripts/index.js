//import 'babel-polyfill'; // for internet explorer - use when bundling for production

import { getScriptForCode } from './pali-script.mjs';
import { appSettings, LangHelper, UT, PT, PT_REFRESH, SearchType } from './settings.js';
import { PitakaTabs } from './pitaka-tabs.js';
import { PitakaTree } from './pitaka-tree.js';
import { LinkHandler } from './note-tag.js';
import { titleStorage } from "./search-common.js";
import { TitleSearch, bookmarks } from './title-search.js';
import { FTSClient } from './fts-client.js';
import { Util, vManager } from './util.js';
import { dictClient } from './dict-client.js';
import { paliAnalysis } from './pali-analysis.js';

const appTree = new PitakaTree($('.pitaka-tree'));
const appTabs = new PitakaTabs($('.text-section'), appTree);
appTree.initialize(appTabs).done(function() {
    // tree loaded
    LinkHandler.initClipboard();
    LinkHandler.tryStartupLocation(appTree, appTabs);
});
const titleSearch = new TitleSearch(appTree, appTabs);
const ftsClient = new FTSClient();
titleStorage.init().then(() => {
    $('.search-bar').on('input', e => performSearch(e)); //keyup compositionend
    $('.search-bar').focus(e => showSearchPane());
    titleSearch.init();
    bookmarks.init(appTree, appTabs);
    ftsClient.init(appTree, appTabs);
}).catch(err => {
    console.error(`Title Search Index init failed with error ${err}`);
});

/*function searchTypeToPane(searchType) {
    if (searchType == SearchType.DICT) return 'dict';
    if (searchType == SearchType.FTS) return 'fts';
    return 'title-search'; // title
}*/
function showSearchPane() {
    const prop = appSettings.searchTypeProp[appSettings.get('searchType')];
    vManager.showPane(prop.pane);
}
function performSearch(e) {
    if (e) e.stopPropagation();
    const searchBarVal = $('.search-bar').val().trim();
    showSearchPane();
    const searchType = appSettings.get('searchType');
    if (searchType == SearchType.FTS) {
        ftsClient.performSearch(searchBarVal);
    } else if (searchType == SearchType.TITLE) {
        titleSearch.performSearch(searchBarVal);
    } else {
        dictClient.performSearch(searchBarVal); //(searchType == SearchType.DICT)
    }
    const inputScript = getScriptForCode(searchBarVal ? searchBarVal.charCodeAt(0) : 0);
    $('.search-bar').attr('script', inputScript);
}

function setNextSearchType(e) {
    const nextType = appSettings.searchTypeProp[appSettings.get('searchType')].next;
    setSearchType(nextType);
    appSettings.set('searchType', nextType);
    performSearch();
}
function setSearchType(type) {
    const prop = appSettings.searchTypeProp[type];
    $('#search-type-button .type-icon').attr('class', 'type-icon ' + prop.iconClass);
    $('.search-bar').attr('placeholder', ' ' + prop.placeholder);
}
$('#search-type-button').click(e => setNextSearchType(e));
const lookupCallback = (word, type) => { // callback to set the search lookup from within pali analaysis window
    console.log(`Loading lookup for ${word}, ${type}`);
    setSearchType(type);
    appSettings.set('searchType', type);
    $('.search-bar').val(word);
    performSearch();
};
paliAnalysis.init(vManager, dictClient, lookupCallback);

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
    ftsClient.changeScript(); // results, status and filters
    dictClient.changeScript(); // results, status
    PT_REFRESH($('#title-bar-text'));
}).children(`[value=${appSettings.get('paliScript')}]`).addClass('active');


// UI Language related
appSettings.uiLanguageList.forEach((val, lang) => {
    if (val[3].t) { // only if the translation available
        Util.createLanguageSelectOption(lang, val).appendTo($('#ui-lang-select'));
    }
});
$('#ui-lang-select').on('click', '.option', e => {
    appSettings.set('uiLanguage', $(e.currentTarget).attr('value'));
    LangHelper.changeTranslation(appSettings.get('uiLanguage'));
}).children(`[value=${appSettings.get('uiLanguage')}]`).addClass('active');

// Dictionary Related
dictClient.dictionaryList.forEach((info, dictName) => 
    Util.createDictionarySelectOption(dictName, info, appSettings.uiLanguageList.get(info[0])).appendTo('.dictionary-select'));
$('.dictionary-select').on('click', '.check', e => dictClient.dictionaryListChanged(e))
    .children(appSettings.get('dictList').map(dict => `[value=${dict}]`).join(',') || 'none').addClass('active');

function changeTextSize(size) {
    $('html').css('font-size', `${size}px`);
}
function changeColorTheme(bodyClass) {
    $('body').attr('class', bodyClass); // replace all classes with this class
}

function populateFormatSelect(formatList, select, settingName, onChangeCallback = '') {
    formatList.forEach((format, val) => {
        const span = $('<span/>').append(UT(format[0]));
        const example = $(format[1]).addClass('example');
        $('<div/>').addClass('option').append(span, example).attr('value', val).appendTo(select);
    });
    select.on('click', '.option', e => {
        const val = appSettings.set(settingName, $(e.currentTarget).attr('value'));
        if (onChangeCallback) onChangeCallback(val);
    }).children(`[value=${appSettings.get(settingName)}]`).addClass('active');
}
populateFormatSelect(appSettings.dictLaunchList, $('#dictionary-launch-select'), 'dictLaunchMethod');
populateFormatSelect(appSettings.footnoteFormatList, $('#footnote-format-select'), 'footnoteFormat', appTabs.changeTextFormat.bind(appTabs));
populateFormatSelect(appSettings.pageTagFormatList, $('#pagetag-format-select'), 'pageTagFormat', appTabs.changeTextFormat.bind(appTabs));
populateFormatSelect(appSettings.colorThemeList, $('#color-theme-select'), 'colorTheme', changeColorTheme);
populateFormatSelect(appSettings.textSizeList, $('#text-size-select'), 'textSize', changeTextSize);
populateFormatSelect(appSettings.tabViewList, $('#tab-view-select'), 'tabViewFormat', appTabs.setTCView.bind(appTabs));

$('.custom-radio').on('click', '.option:not(.check)', e => {
    $(e.currentTarget).addClass('active').siblings().removeClass('active');
    if (appTabs.getNumTabs()) { // only if there are text tabs to show
        vManager.showPane('back'); // go back
    }
});
$('.custom-radio').on('click', '.check', e => $(e.currentTarget).toggleClass('active'));
// launch pali analysis
$(document).on('click', '.pali-analysis,w', e => paliAnalysis.showWindow(e));

// apply initial settings
LangHelper.changeTranslation(appSettings.get('uiLanguage'));
changeTextSize(appSettings.get('textSize'));
changeColorTheme(appSettings.get('colorTheme'));
$('#title-bar-text').append(PT('ඡට්ඨ සංගායනා තිපිටක'));
setSearchType(appSettings.get('searchType'));

//$('#nav-bar-placeholder').css('height', $('#nav-bar').height());