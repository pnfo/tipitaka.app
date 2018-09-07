import { appSettings, LangHelper, UT } from './settings.js';
import { PitakaTabs, vManager } from './pitaka-tabs.js';
import { PitakaTree } from './pitaka-tree.js';
import { LinkHandler } from './note-tag.js';
import { TitleSearch, bookmarks } from './title-search.js';
import { Util } from './util.js';

//import 'babel-polyfill'; // for internet explorer - use when bundling for production

const appTree = new PitakaTree($('.pitaka-tree'));
const appTabs = new PitakaTabs($('.text-section'), appTree);
appTree.initialize(appTabs).done(function() {
    // tree loaded
    LinkHandler.initClipboard();
    LinkHandler.tryStartupLocation(appTree, appTabs);
});
const titleSearch = new TitleSearch($('#search-area'), appTree, appTabs);
titleSearch.init().done(() => {
    bookmarks.init(appTree, appTabs);
});

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
