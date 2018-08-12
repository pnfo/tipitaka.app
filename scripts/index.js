import {appSettings} from './settings.js';
import {PitakaTabs} from './pitaka-tabs.js';
import {PitakaTree} from './pitaka-tree.js';

//import 'babel-polyfill'; // for internet explorer - use when bundling for production

const appTree = new PitakaTree($('.pitaka-tree'));
const appTabs = new PitakaTabs($('.text-section'), appTree);
appTree.initialize(appTabs).done(function() {
    console.log('tree loaded');
    /* set startup location if specified in url params
    var location = getStartupLocation();
    if (location) {
        pitakaLkOpenLocation(location, 'startup');
    } else {
        showSearchArea();
    }*/
});

// populating the settings pane
function createLanguageSelectOption(lang, name, flag) {
    const span = $('<span/>').addClass('UT').text(name).attr('lang', lang);
    const img = $('<img/>').attr('src', `./static/images/${flag}`);
    return $('<div/>').addClass('option').append(span, img).attr('value', lang);
}

const paliScriptSelect = $('#pali-script-select');
appSettings.paliScriptList.forEach((val, lang) => {
    createLanguageSelectOption(lang, val[2], val[3]).appendTo(paliScriptSelect);
});
paliScriptSelect.on('click', '.option', e => {
    const option = $(e.currentTarget);
    //if (appSettings.paliScript == option.attr('value')) return; // no change
    
    console.log(`Pali script changing from ${appSettings.paliScript} to ${option.attr('value')}`);
    appSettings.paliScript = option.attr('value');
    appTree.changeScript(); // all tree item text updated
    appTabs.changeScript(); // check the script of active tab only
}).children(`[value=${appSettings.paliScript}]`).addClass('active');

appSettings.uiLanguageList.forEach((val, lang) => {
    createLanguageSelectOption(lang, val[0], val[1]).appendTo($('#ui-lang-select'));
});
$('#ui-lang-select').on('click', '.option', e => {
    appSettings.uiLanguage = e.currentTarget.value;
    $('i.UT').attr('lang', appSettings.uiLanguage);
}).children(`[value=${appSettings.uiLanguage}]`).addClass('active');

function changeTextSize(size) {
    $('html').css('font-size', `${size}px`);
}

function populateFormatSelect(formatList, select, settingName, onChangeCallback) {
    formatList.forEach((format, val) => {
        const span = $('<span/>').append($('<i/>').addClass('UT').attr('lang', 'en').text(format[0]));
        const example = $(format[1]).addClass('example');
        $('<div/>').addClass('option').append(span, example).attr('value', val).appendTo(select);
    });
    select.on('click', '.option', e => {
        const val = appSettings[settingName] = $(e.currentTarget).attr('value');
        onChangeCallback(val);
    }).children(`[value=${appSettings[settingName]}]`).addClass('active');
}
populateFormatSelect(appSettings.abbreFormatList, $('#abbre-format-select'), 'abbreFormat', appTabs.changeTextFormat.bind(appTabs));
populateFormatSelect(appSettings.pageTagFormatList, $('#pagetag-format-select'), 'pageTagFormat', appTabs.changeTextFormat.bind(appTabs));
populateFormatSelect(appSettings.textSizeList, $('#text-size-select'), 'textSize', changeTextSize);

/*$('#abbre-format-select').on('click', '.option', e => {
    appSettings.abbreFormat = $(e.currentTarget).attr('value');
    appTabs.changeTextFormat();
}).children(`[value=${appSettings.abbreFormat}]`).addClass('active');
$('#pagetag-format-select').on('click', '.option', e => {
    appSettings.pageTagFormat = $(e.currentTarget).attr('value');
    appTabs.changeTextFormat();
}).children(`[value=${appSettings.pageTagFormat}]`).addClass('active');*/

$('.custom-radio').on('click', '.option', e => {
    $(e.currentTarget).addClass('active').siblings().removeClass('active');
    if (appTabs.getNumTabs()) { // only if there are text tabs to show
        showPane('text');
    }
});


$('#settings-button').click(e => showPane('settings'));
$('#text-view-button').click(e => showPane('text'));
$('.search-bar').focus(e => showPane('search'));

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

function handleResize() {
    // to make sure the overlay fills the screen and dialogbox aligned to center
    // only do it if the dialog box is not hidden
    //if (!$('#dialog-box').is(':hidden')) repositionDialog();
}
//$(window).resize(handleResize);


$('span.sort-action').on('click', 'a', function () {
    var by = $(this).parent().attr('by');
    var order = $(this).attr('order');
    refreshCurrentSearchDisplay(by, order);
});

// do this at the end due to index pre-fetching
//initSearchBar();
