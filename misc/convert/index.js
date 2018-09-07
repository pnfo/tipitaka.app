import { Script, paliScriptInfo, TextProcessor, getScriptForCode } from '../../scripts/pali-script.js';
import { Util } from '../../scripts/util.js';
    
// populating the settings pane
// Pali Script Changing
const localStorageKey = 'convert-prev-script';
let selectedScript = localStorage.getItem(localStorageKey) || Script.RO; // default to roman
$('#box2').attr('script', selectedScript);

const paliScriptSelect = $('#pali-script-select');
paliScriptInfo.forEach((val, lang) => {
    Util.createLanguageSelectOption(lang, val, '../../static/images/').appendTo(paliScriptSelect);
});
paliScriptSelect.on('click', '.option', e => {
    const option = $(e.currentTarget);
    option.addClass('active').siblings().removeClass('active');
    //if (appSettings.paliScript == option.attr('value')) return; // no change
    console.log(`Pali script changing to ${option.attr('value')}`);
    selectedScript = option.attr('value');
    localStorage.setItem(localStorageKey, selectedScript); // set to storage for next time
    $('#box2').attr('script', selectedScript);
    runConvert();
}).children(`[value=${selectedScript}]`).addClass('active');

$('#box1').on('change input paste keyup', e => {
    // try to set PT script - best effort
    const inputScript = getScriptForCode($('#box1').val() ? $('#box1').val().charCodeAt(0) : 0);
    $('#box1').attr('script', inputScript);
    runConvert();
});

function runConvert() {
    const sinhStr = TextProcessor.convertFromMixed($('#box1').val());
    console.log(sinhStr);
    $('#box2').val(TextProcessor.convert(sinhStr, selectedScript));
}

$('#copy-button').click(e => {
    Util.copyText( $('#box2').val());
    Util.showToast(`Your text in ${paliScriptInfo.get(selectedScript)[0]} script has been copied to the clipboard. You can now paste it.`);
});

$('#menu-toggle').mousedown(function (e) {
    $('#menu-list').animate({height: 'toggle'}, 200);
    e.stopPropagation();
});
$('#menu-list').mousedown(function(e) {
    e.stopPropagation();
});
$('body').mousedown(function() {
    $('#menu-list').animate({height: 'hide'}, 350);
});