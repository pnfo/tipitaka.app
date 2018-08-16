const paliScriptList = new Map ([
    ['si', ['sinh', 'Sinhala', 'සිංහල', 'sl_flag.png']],
    ['de', ['deva', 'Devanagari', 'हिन्दी', 'in_flag.png']],
    ['ro', ['romn', 'Roman', 'Roman', 'uk_flag.png']],
    ['th', ['thai', 'Thai', 'ภาษาไทย', 'th_flag.png']],
    ['my', ['mymr', 'Myanmar', 'ဗမာစကား', 'my_flag.png']],
    ['gu', ['guja', 'Gujarati', 'ગુજરાતી', 'in_flag.png']]
]);

const uiLanguageList = new Map([
    ['si', ['සිංහල', 'sl_flag.png']],
    ['en', ['English', 'uk_flag.png']]
]);

const abbreFormatList = new Map([
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
    ['18', ['Larger', '<i style="font-size: 18px">Aa</i>']],
    ['20', ['Largest', '<i style="font-size: 20px">Aa</i>']]
]);

class AppSettings {
    constructor() {
        this.uiLanguage = 'en';
        this.paliScript = 'si';
        this.abbreFormat = 'inline';
        this.pageTagFormat = 'click';
        this.textSize = '16';
        this.savedLocations = []; // bookmarks saved by the user
        this.paliScriptList = paliScriptList;
        this.uiLanguageList = uiLanguageList;
        this.abbreFormatList = abbreFormatList;
        this.pageTagFormatList = pageTagFormatList;
        this.textSizeList = textSizeList;
    }
    initialize() {
        if (!this.loadFromStorage()) {
            return this.loadDefaults();
        }
        return true;
    }
    // TODO add functions to read/write to local storage and change
    loadFromStorage() {}
    saveToStorage() {}
    // try to determine from browser or ip address
    loadDefaults() {}
}


export class Language {
    static extractLanguageStrings(lang) {
        // copy over the entries from the current translation
        Language.loadTranslation(lang).then(function() {
            const translations = new Map(data_trans);
            $('i.UT').each((i, ut) => {
                const enText = $(ut).attr('lang') == 'en' ? $(ut).text().trim() : $(ut).attr('en-text');
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
        if (lang == 'en') { // no need to load translations
            $('i.UT').each((_1, ut) => $(ut).text($(ut).attr('en-text') || $(ut).text().trim())).attr('lang', lang);
            return;
        }
        Language.loadTranslation(lang).then(function() { // if not 'en' load translations
            const translations = new Map(data_trans);
            $('i.UT').each((_1, ut) => {
                const enText = $(ut).attr('lang') == 'en' ? $(ut).text().trim() : $(ut).attr('en-text');
                if (!enText) {
                    console.error(`UT found with empty en-text ${$(ut)}`);
                }
                if (translations.has(enText)) {
                    $(ut).attr('en-text', enText).attr('lang', lang).text(translations.get(enText));
                } else {
                    // leave as-is in english
                }
            }).attr('lang', lang);
        });
    }
}
//setTimeout(Language.extractLanguageStrings, 1000, 'si');
//Language.changeTranslation('si');
export const appSettings = new AppSettings();
