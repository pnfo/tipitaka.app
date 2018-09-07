
import {Script, paliScriptInfo, TextProcessor } from './pali-script.js';

const Language = Object.freeze({
    SI: 'si',
    EN: 'en'
});
const uiLanguageList = new Map([
    [Language.SI, ['', 'සිංහල', [], {f: 'sl_flag.png'} ]],
    [Language.EN, ['', 'English', [], {f: 'uk_flag.png'} ]],
]);

const footnoteFormatList = new Map([
    ['none', ['Do Not Show', '']],
    ['click', ['Show On Click', '<n><i class="far fa-asterisk"></i></n>']],
    ['inline', ['Show Inline', '<n>[…]</n>']]
]);

const pageTagFormatList = new Map([
    ['none', ['Do Not Show', '']],
    ['click', ['Show On Click', '<pd class="T">¶</pd>']],
    ['short', ['Short Name', '<pd class="T">[T 1.34]</pd>']],
    ['full', ['Full Name', '<pd class="T">[Thai 3.41]</pd>']]
]);

const textSizeList = new Map([
    ['12', ['Smallest', '<i style="font-size: 12px">Aa</i>']],
    ['14', ['Smaller', '<i style="font-size: 14px">Aa</i>']],
    ['16', ['Medium', '<i style="font-size: 16px">Aa</i>']],
    ['19', ['Larger', '<i style="font-size: 18px">Aa</i>']],
    ['22', ['Largest', '<i style="font-size: 20px">Aa</i>']],
    ['26', ['XL', '<i style="font-size: 22px">Aa</i>']],
    ['32', ['XXL', '<i style="font-size: 24px">Aa</i>']],
]);

const defaultSettings = { // to be used when not found in local storage
    footnoteFormat: 'inline',
    pageTagFormat: 'click',
    textSize: '16',
    uiLanguage: Language.EN,
    tabViewFormat: 'tabbed',
};
class AppSettings {
    constructor() {
        this.settings = {};
        this.loadFromStorage();
        this.paliScriptList = paliScriptInfo;
        this.uiLanguageList = uiLanguageList;
        this.footnoteFormatList = footnoteFormatList;
        this.pageTagFormatList = pageTagFormatList;
        this.textSizeList = textSizeList;
    }
    // functions to read/write to local storage and change
    set(prop, value) {
        this.settings[prop] = value;
        localStorage.setItem('settings', JSON.stringify(this.settings));
        return value;
    }
    get(prop) {
        return this.settings[prop];
    }
    loadFromStorage() {
        const settingsStr = localStorage.getItem('settings');
        this.settings = settingsStr ? JSON.parse(settingsStr) : {};

        if (this.settings['paliScript']) {
            this.paliScriptSource = 'storage';
        } else {
            this.paliScriptSource = 'default';
            this.settings['paliScript'] = Script.SI; // todo take this from GPS
        }
        this.loadDefaults();
    }
    
    // try to determine from browser or ip address
    loadDefaults() {
        Object.keys(defaultSettings).forEach(key => {
            if (!this.settings[key]) this.settings[key] = defaultSettings[key]; 
        });
    }
}

// for dynamically created UT elements
export const stringResources = {
    'copy-link': 'Link has been copied to the clipboard. You can now paste it.',
};
// based on the uiLanguage selected - store the translations
let currentTranslations = new Map();
export class LangHelper {
    static extractLanguageStrings(lang) {
        // copy over the entries from the current translation
        LangHelper.loadTranslation(lang).then(function() {
            const translations = new Map(data_trans);
            $('i.UT').each((i, ut) => {
                const enText = $(ut).attr('lang') == Language.EN ? $(ut).text().trim() : $(ut).attr('en-text');
                if (!translations.has(enText)) {
                    translations.set(enText, ''); // new translation needed
                }
            });
            Object.entries(stringResources).forEach(([_1, enText]) => {
                if (!translations.has(enText)) {
                    translations.set(enText, ''); // new translation needed
                }
            });
            const logPhrases = [];
            translations.forEach((trans, enText) => logPhrases.push(enText, trans));
            console.log(logPhrases.join('\r\n'));
        });
    }

    static loadTranslation(lang) {
        const scriptFile = `./scripts/translations/${lang}_trans.js`;
        return $.getScript( scriptFile, function( data, textStatus, jqxhr ) {
            console.log(`Translation script with data length ${data.length} was loaded from file ${scriptFile}. 
                Status '${textStatus}:${jqxhr.status}`); // Data returned
        });
    }
    static changeTranslation(lang) {
        console.log(`changing UI language to ${lang}`);
        if (lang == Language.EN) { // no need to load translations
            $('i.UT').each((_1, ut) => $(ut).text($(ut).attr('en-text') || $(ut).text().trim())).attr('lang', lang);
            return;
        }
        LangHelper.loadTranslation(lang).then(function() { // if not 'en' load translations
            currentTranslations = new Map(data_trans);
            $('i.UT').each((_1, ut) => {
                const enText = $(ut).attr('en-text') || $(ut).text().trim();
                if (!enText) {
                    console.error(`UT found with empty en-text ${$(ut)}`);
                }
                if (currentTranslations.has(enText)) {
                    $(ut).attr('en-text', enText).attr('lang', lang).text(currentTranslations.get(enText));
                } else {
                    // leave as-is in english
                    $(ut).attr('lang', Language.EN);
                }
            });
        });
    }
}

// create a new translated text string based on the current ui language
export function UT(enText) {
    const translated = currentTranslations.get(enText);
    const ut = $('<i/>').addClass('UT').attr('en-text', enText).attr('lang', translated ? appSettings.get('uiLanguage') : Language.EN);
    return ut.text(translated || enText);
}

/**
 * Macro function to get the pali text in the selected script in settings
 * param text - should be the text in sinhala script
 */
export function PT(text) {
    const pt = $('<i/>').addClass('PT').attr('si-text', text).attr('script', appSettings.get('paliScript'));
    return pt.text(TextProcessor.convert(text, appSettings.get('paliScript')));
}
// change language of all PT in the root
export function PT_REFRESH(root) {
    $('i.PT', root).each((_1, pt) => {
        let text = $(pt).attr('si-text');
        text = TextProcessor.convert(text, appSettings.get('paliScript'));
        $(pt).text(text).attr('script', appSettings.get('paliScript'));
    });
}

//setTimeout(Language.extractLanguageStrings, 1000, 'si');
//Language.changeTranslation('si');
export const appSettings = new AppSettings();
