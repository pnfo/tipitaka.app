import {Script, paliScriptInfo, TextProcessor } from './pali-script.mjs';

export const Language = Object.freeze({
    SI: 'si',
    EN: 'en',
    CHINESE: 'ch',
    HI: 'hi',
    INDO: 'in',
    BUR: 'my',
    THAI: 'th',
});

const uiLanguageList = new Map([
    [Language.SI, ['Sinhala', 'සිංහල', [], {f: 'sl_flag.png', t: true} ]],
    [Language.EN, ['English', 'English', [], {f: 'uk_flag.png', t: true} ]],
    [Language.CHINESE, ['Chinese', '汉语', [], {f: 'china_flag.png'} ]],
    [Language.HI, ['Hindi', 'हिन्दी', [], {f: 'in_flag.png'} ]],
    [Language.INDO, ['Indonesian', 'baˈhasa indoneˈsia', [], {f: 'indonesia_flag.png'} ]],
    [Language.BUR, ['Burmese', 'မြန်မာဘာသာ', [], {f: 'my_flag.png'} ]],
    [Language.THAI, ['Thai', 'ภาษาไทย', [], {f: 'th_flag.png'} ]],
]);

const dictLaunchList = new Map([
    ['none', ['Do Not Show', '<i class="far fa-eye-slash"/>']],
    ['click', ['Show On Click', '<i class="fal fa-mouse-pointer"></i>']],
    ['hover', ['Show On Hover', '<i class="far fa-bullseye"></i>']]
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
    ftsSelected: false,
    dictList: ['en-buddhadatta'],
    dictLaunchMethod: 'click',
};

class AppSettings {
    constructor() {
        this.settings = {};
        this.loadFromStorage();
        this.paliScriptList = paliScriptInfo;
        this.uiLanguageList = uiLanguageList;
        this.dictLaunchList = dictLaunchList;
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
        console.log(this.settings);
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
    'enter-more-characters': 'Please enter minimun XXX characters to start the searching.',
    'fts-search-term-one-char': 'Each of the search terms must have at least one character.',
    'fts-too-many-results-found': 'XXX results found. First YYY results shown.',
    'fts-range-word-distance': 'Allowed Range for word distance 1 - 99.',
    'too-many-results-found': 'Too many results found. First XXX of results shown.',
    'number-of-results-found': 'XXX results found for your search term.',
    'no-results-found': 'Search term XXX did not return any results.',
    'number-of-bookmarks': 'There are XXX bookmarks matching your filter.',
    'no-bookmarks': 'You have no bookmarks saved. Click the star icon to save to bookmarks.',
};
// based on the uiLanguage selected - store the translations
let currentTranslations = new Map();
export class LangHelper {
    static async extractLanguageStrings(lang) {
        // copy over the entries from the current translation
        await LangHelper.loadTranslation(lang);

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
    }

    static async loadTranslation(lang) {
        const scriptFile = `./scripts/translations/${lang}_trans.js`;
        await $.getScript( scriptFile, function( data, textStatus, jqxhr ) {
            console.log(`Translation script with data length ${data.length} was loaded from file ${scriptFile}. 
                Status '${textStatus}:${jqxhr.status}`); // Data returned
        });
    }
    static async changeTranslation(lang) {
        console.log(`changing UI language to ${lang}`);
        if (lang == Language.EN) { // no need to load translations
            currentTranslations.clear(); // 
            $('i.UT').each((_1, ut) => $(ut).text($(ut).attr('en-text') || $(ut).text().trim())).attr('lang', lang);
            return;
        }
        await LangHelper.loadTranslation(lang); // if not 'en' load translations
        currentTranslations = new Map(data_trans.filter(pair => pair[1]));
        $('i.UT').each((_1, ut) => {
            const enText = $(ut).attr('en-text') || $(ut).text().trim();
            if (!enText) {
                console.error(`UT found with empty en-text ${$(ut)}`);
            }
            if (currentTranslations.has(enText)) {
                $(ut).attr('en-text', enText).attr('lang', lang).text(currentTranslations.get(enText));
                // bug here - text params will not be replaced
            } else {
                // leave as-is in english
                $(ut).attr('lang', Language.EN);
            }
        });
    }
}

// create a new translated text string based on the current ui language
export function UT(enText, param1 = '', param2 = '') {
    enText = stringResources[enText] || enText;
    const translated = appSettings.get('uiLanguage') != Language.EN ? currentTranslations.get(enText) : '';
    const finalText = (translated || enText).replace('XXX', param1).replace('YYY', param2); // if XXX occurs
    const ut = $('<i/>').addClass('UT').attr('en-text', enText)
        .attr('lang', translated ? appSettings.get('uiLanguage') : Language.EN);
    return ut.text(finalText);
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

//setTimeout(() => LangHelper.extractLanguageStrings('si'), 1000);

export const appSettings = new AppSettings();
