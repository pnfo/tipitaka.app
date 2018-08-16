"use strict";

/*const deva_specials = [
    ['\u0D82','\u0902'], // niggahita - anusawara
    ['\u0D83','\u0903'], // visarga - not in pali but deva original text has it

    // independent vowels
    ['\u0D85','\u0905'], // a
    ['\u0D86','\u0906'], // aa
    ['\u0D89','\u0907'], // i
    ['\u0D8A','\u0908'], // ii
    ['\u0D8B','\u0909'], // u
    ['\u0D8C','\u090A'], // uu
    ['\u0D91','\u090F'], // e
    ['\u0D94','\u0913'], // o

    // various signs
    ['\u0DCA','\u094D'], // Sinhala virama -> Dev. virama (al - hal)

    // digits
    ['0', '\u0966'],
    ['1', '\u0967'],
    ['2', '\u0968'],
    ['3', '\u0969'],
    ['4', '\u096A'],
    ['5', '\u096B'],
    ['6', '\u096C'],
    ['7', '\u096D'],
    ['8', '\u096E'],
    ['9', '\u096F'],
];*/
/*const deva_conso = [
    // velar stops
    ['\u0D9A','\u0915'], // ka
    ['\u0D9B','\u0916'], // kha
    ['\u0D9C','\u0917'], // ga
    ['\u0D9D','\u0918'], // gha
    ['\u0D9E','\u0919'], // n overdot a

    // palatal stops
    ['\u0DA0','\u091A'], // ca
    ['\u0DA1','\u091B'], // cha
    ['\u0DA2','\u091C'], // ja
    ['\u0DA3','\u091D'], // jha
    ['\u0DA4','\u091E'], // �a

    // retroflex stops
    ['\u0DA7','\u091F'], // t underdot a
    ['\u0DA8','\u0920'], // t underdot ha
    ['\u0DA9','\u0921'], // d underdot a
    ['\u0DAA','\u0922'], // d underdot ha
    ['\u0DAB','\u0923'], // n underdot a

    // dental stops
    ['\u0DAD','\u0924'], // ta
    ['\u0DAE','\u0925'], // tha
    ['\u0DAF','\u0926'], // da
    ['\u0DB0','\u0927'], // dha
    ['\u0DB1','\u0928'], // na

    // labial stops
    ['\u0DB4','\u092A'], // pa
    ['\u0DB5','\u092B'], // pha
    ['\u0DB6','\u092C'], // ba
    ['\u0DB7','\u092D'], // bha
    ['\u0DB8','\u092E'], // ma

    // liquids, fricatives, etc.
    ['\u0DBA','\u092F'], // ya
    ['\u0DBB','\u0930'], // ra
    ['\u0DBD','\u0932'], // la
    ['\u0DC0','\u0935'], // va
    ['\u0DC3','\u0938'], // sa
    ['\u0DC4','\u0939'], // ha
    ['\u0DC5','\u0933'], // l underdot a
];*/
/*const deva_vowels = [
    // dependent vowel signs
    ['\u0DCF','\u093E'], // aa
    ['\u0DD2','\u093F'], // i
    ['\u0DD3','\u0940'], // ii
    ['\u0DD4','\u0941'], // u
    ['\u0DD6','\u0942'], // uu
    ['\u0DD9','\u0947'], // e
    ['\u0DDC','\u094B'], // o
];*/
const lang_index = { 'si': 0, 'de': 1, 'ro': 2, 'th': 3 };
const specials = [
    ['ං', 'ं', 'ṃ', '\u0E4D'], // niggahita - anusawara
    ['ඃ', 'ः', 'ḥ', ''], // visarga - not in pali but deva original text has it (thai - not found)
    // independent vowels
    ['අ', 'अ', 'a', 'อ'],
    ['ආ', 'आ', 'ā', 'อา'],
    ['ඉ', 'इ', 'i', 'อิ'],
    ['ඊ', 'ई', 'ī', 'อี'],
    ['උ', 'उ', 'u', 'อุ'],
    ['ඌ', 'ऊ', 'ū', 'อู'],
    ['එ', 'ए', 'e', 'เอ'],
    ['ඔ', 'ओ', 'o', 'โอ'],
    // various signs
    ['්', '्', '', '\u0E3A'], // virama (al - hal). roman need special handling
    // digits
    ['0', '०', '0', '๐'],
    ['1', '१', '1', '๑'],
    ['2', '२', '2', '๒'],
    ['3', '३', '3', '๓'],
    ['4', '४', '4', '๔'],
    ['5', '५', '5', '๕'],
    ['6', '६', '6', '๖'],
    ['7', '७', '7', '๗'],
    ['8', '८', '8', '๘'],
    ['9', '९', '9', '๙']
];

const consos = [
    // velar stops
    ['ක', 'क', 'k', 'ก'],
    ['ඛ', 'ख', 'kh', 'ข'],
    ['ග', 'ग', 'g', 'ค'],
    ['ඝ', 'घ', 'gh', 'ฆ'],
    ['ඞ', 'ङ', 'ṅ', 'ง'],
    // palatal stops
    ['ච', 'च', 'c', 'จ'],
    ['ඡ', 'छ', 'ch', 'ฉ'],
    ['ජ', 'ज', 'j', 'ช'],
    ['ඣ', 'झ', 'jh', 'ฌ'],
    ['ඤ', 'ञ', 'ñ', 'ญ'],
    // retroflex stops
    ['ට', 'ट', 'ṭ', 'ฎ'],
    ['ඨ', 'ठ', 'ṭh', 'ฐ'],
    ['ඩ', 'ड', 'ḍ', 'ฑ'],
    ['ඪ', 'ढ', 'ḍh', 'ฒ'],
    ['ණ', 'ण', 'ṇ', 'ณ'],
    // dental stops
    ['ත', 'त', 't', 'ต'],
    ['ථ', 'थ', 'th', 'ถ'],
    ['ද', 'द', 'd', 'ท'],
    ['ධ', 'ध', 'dh', 'ธ'],
    ['න', 'न', 'n', 'น'],
    // labial stops
    ['ප', 'प', 'p', 'ป'],
    ['ඵ', 'फ', 'ph', 'ผ'],
    ['බ', 'ब', 'b', 'พ'],
    ['භ', 'भ', 'bh', 'ภ'],
    ['ම', 'म', 'm', 'ม'],
    // liquids, fricatives, etc.
    ['ය', 'य', 'y', 'ย'],
    ['ර', 'र', 'r', 'ร'],
    ['ල', 'ल', 'l', 'ล'],
    ['ව', 'व', 'v', 'ว'],
    ['ස', 'स', 's', 'ส'],
    ['හ', 'ह', 'h', 'ห'],
    ['ළ', 'ळ', 'ḷ', 'ฬ']
];

const vowels = [
    // dependent vowel signs
    ['ා', 'ा', 'ā', 'า'],
    ['ි', 'ि', 'i', '\u0E34'],
    ['ී', 'ी', 'ī', '\u0E35'],
    ['ු', 'ु', 'u', '\u0E38'],
    ['ූ', 'ू', 'ū', '\u0E39'],
    ['ෙ', 'े', 'e', 'เ'], //for thai - should appear in front
    ['ො', 'ो', 'o', 'โ'], //for thai - should appear in front
];
const sinh_conso_range = 'ක-ෆ';
const thai_conso_range = 'ก-ฮ';

function beautify_sinh(text, rendType = '') {
    // change joiners before U+0DBA Yayanna and U+0DBB Rayanna to Virama + ZWJ
    return text.replace(/\u0DCA([\u0DBA\u0DBB])/g, '\u0DCA\u200D$1');
}
/**
 * Each script need additional steps when rendering on screen
 * e.g. for sinh needs converting dandas/abbrev, removing spaces, and addition ZWJ
 */
function beautify_common(text, rendType = '') {
    // remove double dandas around namo tassa
    if (rendType == 'cen') 
        text = text.replace('\u0965', '');
    // in gathas, single dandas convert to semicolon, double to period
    else if (rendType.startsWith('ga')) {
        text = text.replace('\u0964', ';');
        text = text.replace('\u0965', '.');
    }

    // remove Dev abbreviation sign before an ellipsis. We don't want a 4th dot after pe.
    text = text.replace('\u0970\u2026', '\u2026');

    // dev. abbre sign, all other single and double dandas converted to period
    text = text.replace(/\u0970/g, '·'); // abbre sign changed - prevent capitalization in notes
    text = text.replace(/[\u0964\u0965]/g, '.');

    // cleanup punctuation 1) two spaces to one
    // 2) There should be no spaces before these punctuation marks. 
    text = text.replace(/\s([\s,!;\?\.])/g, '$1');
    return text;
}
// for roman text only
function capitalize(text, rendType = '') {
    text = text.replace(/^(\S)/g, (_1, p1) => { // begining of a line
        return p1.toUpperCase();
    });
    text = text.replace(/([\.\?]\s)(\S)/g, (_1, p1, p2) => { // beginning of sentence
        return `${p1}${p2.toUpperCase()}`;
    });
    return text.replace(/([\u201C‘])(\S)/g, (_1, p1, p2) => { // starting from a quote
        return `${p1}${p2.toUpperCase()}`;
    });
}
// for thai text - this can also be done in the convert stage
function swap_e_o(text, rendType = '') { 
    return text.replace(/([ก-ฮ])([เโ])/g, '$2$1'); 
}

const beautify_func = {
    'si': [beautify_sinh, beautify_common],
    'de': [],
    'ro': [beautify_common, capitalize],
    'th': [swap_e_o, beautify_common],
};

/* zero-width joiners - replace both ways
['\u200C', ''], // ZWNJ (remove) not in sinh (or deva?)
['\u200D', ''], // ZWJ (remove) will be added when displaying*/
function cleanupZWJ(inputText) {
    return inputText.replace(/\u200C|\u200D/g, '');
}
function prepareHashMap(fromIndex, toIndex) {
    let fullAr = consos.concat(specials, vowels), finalAr = [];
    fullAr.forEach(val => {
        if (val[fromIndex]) { // filter empty
            finalAr.push([val[fromIndex], val[toIndex]]);
        }
    });
    return new Map(finalAr);
}
function replaceByMap(inputText, hashMap) {
    inputText = cleanupZWJ(inputText);
    let newChar = '', oldChar = '', outputAr = new Array(inputText.length);
    for (let i = 0; i < inputText.length; i++) {
        oldChar = inputText.charAt(i);
        //console.log(oldChar.charCodeAt(0));
        if (hashMap.has(oldChar)) {
            outputAr[i] = hashMap.get(oldChar); // note: can be empty string too
        } else {
            outputAr[i] = oldChar;
        }
    }
    return outputAr.join('');
}

// for roman text - insert 'a' after all consonants that are not followed by virama, dependent vowel or 'a'
function insert_a(lang, text) {
    text = text.replace(/([ක-ෆ])([^\u0DCF-\u0DDF\u0DCAa])/g, '$1a$2');
    text = text.replace(/([ක-ෆ])([^\u0DCF-\u0DDF\u0DCAa])/g, '$1a$2');
    return text.replace(/([ක-ෆ])$/g, '$1a'); // conso at the end of string not matched by regex above
}

const convert_to_func = {
    'si' : [],
    'de' : [convert_to],
    'ro' : [insert_a, convert_to],
    'th' : [convert_to]
}
const convert_from_func = {
    'si' : [],
    'de' : [convert_from]
}
function convert_to(lang, text) {
    const hashMap = prepareHashMap(lang_index['si'], lang_index[lang]);
    return replaceByMap(text, hashMap);
}
function convert_from(lang, text) {
    const hashMap = prepareHashMap(lang_index[lang], lang_index['si']);
    return replaceByMap(text, hashMap);
}

class TextProcessor {
    constructor() {
    }
    /**
     * @param {string} text is the text in sinhala script
     * @param {Language} lang 
     */
    basicConvert(text, lang) {
        convert_to_func[lang].forEach(func => text = func(lang, text));
        return text;
    }
    // text is not in sinhala script
    beautify(text, lang, rendType = '') {
        beautify_func[lang].forEach(func => text = func(text, rendType));
        return text;
    }
    convert(text, lang) {
        text = this.basicConvert(text, lang);
        return this.beautify(text, lang);
    }
}
const textProcessor = new TextProcessor();

export {textProcessor};



//let testDev = '॥ नमो तस्स भगवतो अरहतो सम्मासम्बुद्धस्स॥';
//console.log(deva_sinh(testDev));


 

            