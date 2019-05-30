import {Script, paliScriptInfo, TextProcessor } from './pali-script.mjs';

export const Language = Object.freeze({
    SI: 'si',
    EN: 'en',
    CHINESE: 'ch',
    HI: 'hi',
    INDO: 'in',
    BUR: 'my',
    THAI: 'th',
    ES: 'es', // spanish
    PT: 'pt', // portuguese
});

export const SearchType = Object.freeze({
    TITLE: 'title',
    FTS: 'fts',
    DICT: 'dict',
});

const searchTypeProp = Object.freeze({
    [SearchType.TITLE]: { pane: 'title-search', placeholder: 'Search Sutta Titles', next: SearchType.FTS, iconClass: 'far fa-heading fa-fw' }, 
    [SearchType.FTS]: { pane: 'fts', placeholder: 'Full Text Search', next: SearchType.DICT, iconClass: 'far fa-file-alt fa-fw' }, 
    [SearchType.DICT]: { pane: 'dict', placeholder: 'Dictionary Search', next: SearchType.TITLE, iconClass: 'far fa-books fa-fw' }, 
});

const uiLanguageList = new Map([
    [Language.SI, ['Sinhala', 'සිංහල', [], {f: 'sl_flag.png', t: true} ]],
    [Language.EN, ['English', 'English', [], {f: 'uk_flag.png', t: true} ]],
    [Language.CHINESE, ['Chinese', '汉语', [], {f: 'china_flag.png'} ]],
    [Language.HI, ['Hindi', 'हिन्दी', [], {f: 'in_flag.png'} ]],
    [Language.INDO, ['Indonesian', 'baˈhasa indoneˈsia', [], {f: 'indonesia_flag.png'} ]],
    [Language.BUR, ['Burmese', 'ဗမာစာ', [], {f: 'my_flag.png'} ]],
    [Language.THAI, ['Thai', 'ภาษาไทย', [], {f: 'th_flag.png'} ]],
    [Language.KM, ['Khmer', 'ភាសាខ្មែរ', [], {f: 'kh_flag.png'} ]],
    [Language.ES, ['Spanish', 'Español', [], {f: 'es_flag.png'} ]],
    [Language.PT, ['Portuguese', 'Português', [], {f: 'pt_flag.png'} ]],
]);

/*const dictLaunchList = new Map([
    ['none', ['Do Not Show', '<i class="far fa-eye-slash"/>']],
    ['click', ['Show On Click', '<i class="fal fa-mouse-pointer"></i>']],
    ['hover', ['Show On Hover', '<i class="far fa-bullseye"></i>']]
]);*/

const analysisStyleList = new Map([
    ['top', []],
    ['bottom', []]
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

const colorThemeList = new Map([
    ['light', ['Light', '<i class="fal fa-lightbulb-on"/>']],
    ['dark', ['Dark', '<i class="fal fa-lightbulb-slash"/>']],
]);

const tabViewList = new Map([
    ['disabled', ['Single', '<i class="far fa-folder"/>']],
    ['tabbed', ['Tab View', '<i class="far fa-folders"/>']],
    ['columns', ['Columns', '<i class="far fa-columns"/>']],
]);

const defaultSettings = { // to be used when not found in local storage
    searchType: SearchType.FTS,
    footnoteFormat: 'click',
    pageTagFormat: 'click',
    textSize: '16',
    colorTheme: 'dark',
    paliScript: Script.RO,
    uiLanguage: Language.EN,
    tabViewFormat: 'tabbed',
    ftsSelected: false,
    dictList: ['en-buddhadatta'],
    //dictLaunchMethod: 'click',
    analysisStyle: 'bottom',
};

class AppSettings {
    constructor() {
        this.settings = {};
        this.loadFromStorage();
        this.searchTypeProp = searchTypeProp;
        this.paliScriptList = paliScriptInfo;
        this.uiLanguageList = uiLanguageList;
        //this.dictLaunchList = dictLaunchList;
        this.analysisStyleList = analysisStyleList;
        this.footnoteFormatList = footnoteFormatList;
        this.pageTagFormatList = pageTagFormatList;
        this.textSizeList = textSizeList;
        this.colorThemeList = colorThemeList;
        this.tabViewList = tabViewList;
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
    async loadFromStorage() {
        const settingsStr = localStorage.getItem('settings');
        this.settings = settingsStr ? JSON.parse(settingsStr) : {};

        if (this.settings['paliScript']) {
            this.localeSource = 'storage';
        } else {
            this.localeSource = 'gps';
        }
        this.loadDefaults();
        console.log(`Settings loaded from storage ${JSON.stringify(this.settings)}`);
    }
    
    // try to determine from browser or ip address
    loadDefaults() {
        Object.keys(defaultSettings).forEach(key => {
            if (!this.settings[key]) this.settings[key] = defaultSettings[key]; 
        });
    }
    
    async setGPSCountryInfo() {
        const response = await $.getJSON('https://ipinfo.io?token=2632ab35d5f487');
        console.log(`Got location info from GPS ${JSON.stringify(response)}`);
        const countryCode = response.country;
        console.log(`Setting the pali script and ui language based on the country code ${countryCode}`);
        return [ countryToPaliScript.get(countryCode) || Script.RO, countryToUiLanguage.get(countryCode) || Language.EN ];
    }
}

const countryToPaliScript = new Map([
    ['LK', Script.SI],
    ['IN', Script.HI],
    ['TH', Script.THAI],
    ['LA', Script.LAOS],
    ['MM', Script.MY],
    ['KH', Script.KM],
    ['BD', Script.BENG],
    ['RU', Script.CYRL],
]);

const countryToUiLanguage = new Map([
    ['LK', Language.SI],
    ['TH', Language.EN], // update when translations available 
]);

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
    'bookmark-added': 'Bookmark added',
    'bookmark-deleted': 'Bookmark deleted',
    //'dictionary-loading': 'Dictionary Loading...',
    //'fts-loading': 'Full Text Search Loading. Please wait...',
};

// based on the uiLanguage selected - store the translations
let currentTranslations = new Map();
export class LangHelper {
    static async extractLanguageStrings(lang) {
        // copy over the entries from the current translation
        const translations = await LangHelper.loadTranslation(lang);//        new Map(data_trans);
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
        console.log(`Copy the lines below to a new text file for language ${lang}`);
        console.log(logPhrases.join('\r\n'));
    }

    static async loadTranslation(lang) {
        const jsonLines = [];
        try {
            const lines = (await $.get(`./static/translations/${lang}.txt`)).split('\r\n');
            for (let i = 0; i < lines.length; i+=2) {
                jsonLines.push([lines[i].trim(), lines[i+1].trim()]);
            }
        } catch (e) { console.log(e); }
        return new Map(jsonLines);
    }
    static async changeTranslation(lang) {
        console.log(`changing UI language to ${lang}`);
        $('#help-area').empty().attr('lang', lang); // clear help area
        if (lang == Language.EN) { // no need to load translations
            currentTranslations.clear(); // 
            $('i.UT').each((_1, ut) => $(ut).text($(ut).attr('en-text') || $(ut).text().trim())).attr('lang', lang);
            return;
        }
        currentTranslations = await LangHelper.loadTranslation(lang); // if not 'en' load translations - new Map(data_trans.filter(pair => pair[1]));
        $('i.UT').each((_1, ut) => {
            const enText = $(ut).attr('en-text') || $(ut).text().trim();
            if (!enText) {
                console.error(`UT found with empty en-text ${$(ut)}`);
            }
            if (currentTranslations.get(enText)) { // has and not empty
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

//setTimeout(() => LangHelper.extractLanguageStrings('th'), 1000);

export const appSettings = new AppSettings();
