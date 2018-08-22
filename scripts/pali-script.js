/**
 * Copyright Path Nirvana 2018
 * The code and character mapping defined in this file can not be used for any commercial purposes.
 * Permission from the auther is required for all other purposes.
 */

"use strict";

export const Script = Object.freeze({
    SI: 'si',
    HI: 'hi',
    RO: 'ro',
    THAI: 'th',
    LAOS: 'lo',
    MY: 'my',
    KM: 'km',
    //GUJA: 'gj'
});

export const paliScriptInfo = new Map ([
    [Script.SI, ['Sinhala', 'සිංහල', 'sl_flag.png']],
    [Script.HI, ['Devanagari', 'हिन्दी', 'in_flag.png']],
    [Script.RO, ['Roman', 'Roman', 'uk_flag.png']],
    [Script.THAI, ['Thai', 'ภาษาไทย', 'th_flag.png']],
    [Script.LAOS, ['Laos', 'ພາສາລາວ', 'laos_flag.png']],
    [Script.MY, ['Myanmar', 'ဗမာစာ', 'my_flag.png']],
    [Script.KM, ['Khmer', 'ភាសាខ្មែរ', 'kh_flag.png']],
    //[Script.TAITHAM, ['Tai Tham', 'ᨲ᩠ᩅᩫᨾᩮᩥᩬᨦ', 'th_flag.png']],
    //[Script.GUJA, ['Gujarati', 'ગુજરાતી', 'in_flag.png']]
]);

const script_index = { 
    [Script.SI]: 0, 
    [Script.HI]: 1, 
    [Script.RO]: 2,
    [Script.THAI]: 3, 
    [Script.LAOS]: 4,
    [Script.MY]: 5,
    [Script.KM]: 6,
};
const specials = [
    // independent vowels
    ['අ', 'अ', 'a', 'อ', 'ອ', 'အ', 'អ'],
    ['ආ', 'आ', 'ā', 'อา', 'ອາ', 'အာ', 'អា'],
    ['ඉ', 'इ', 'i', 'อิ', 'ອິ', 'ဣ', 'ឥ'],
    ['ඊ', 'ई', 'ī', 'อี', 'ອີ', 'ဤ', 'ឦ'],
    ['උ', 'उ', 'u', 'อุ', 'ອຸ', 'ဥ', 'ឧ'],
    ['ඌ', 'ऊ', 'ū', 'อู', 'ອູ', 'ဦ', 'ឩ'],
    ['එ', 'ए', 'e', 'เอ', 'ເອ', 'ဧ', 'ឯ'],
    ['ඔ', 'ओ', 'o', 'โอ', 'ໂອ', 'ဩ', 'ឱ'],
    // various signs
    ['ං', 'ं', 'ṃ', '\u0E4D', '\u0ECD', 'ံ', 'ំ'], // niggahita - anusawara
    ['ඃ', 'ः', 'ḥ', '', '', 'း', 'ះ'], // visarga - not in pali but deva original text has it (thai - not found)
    ['්', '्', '', '\u0E3A', '\u0EBA', '္', '្'], // virama (al - hal). roman need special handling
    // digits
    ['0', '०', '0', '๐', '໐', '၀', '០'],
    ['1', '१', '1', '๑', '໑', '၁', '១'],
    ['2', '२', '2', '๒', '໒', '၂', '២'],
    ['3', '३', '3', '๓', '໓', '၃', '៣'],
    ['4', '४', '4', '๔', '໔', '၄', '៤'],
    ['5', '५', '5', '๕', '໕', '၅', '៥'],
    ['6', '६', '6', '๖', '໖', '၆', '៦'],
    ['7', '७', '7', '๗', '໗', '၇', '៧'],
    ['8', '८', '8', '๘', '໘', '၈', '៨'],
    ['9', '९', '9', '๙', '໙', '၉', '៩']
];

const consos = [
    // velar stops
    ['ක', 'क', 'k', 'ก', 'ກ', 'က', 'ក'],
    ['ඛ', 'ख', 'kh', 'ข', 'ຂ', 'ခ', 'ខ'],
    ['ග', 'ग', 'g', 'ค', 'ຄ', 'ဂ', 'គ'],
    ['ඝ', 'घ', 'gh', 'ฆ', '\u0E86', 'ဃ', 'ឃ'],
    ['ඞ', 'ङ', 'ṅ', 'ง', 'ງ', 'င', 'ង'],
    // palatal stops
    ['ච', 'च', 'c', 'จ', 'ຈ', 'စ', 'ច'],
    ['ඡ', 'छ', 'ch', 'ฉ', '\u0E89', 'ဆ', 'ឆ'],
    ['ජ', 'ज', 'j', 'ช', 'ຊ', 'ဇ', 'ជ'],
    ['ඣ', 'झ', 'jh', 'ฌ', '\u0E8C', 'ဈ', 'ឈ'],
    ['ඤ', 'ञ', 'ñ', 'ญ', '\u0E8E', 'ဉ', 'ញ'],
    // retroflex stops
    ['ට', 'ट', 'ṭ', 'ฏ', '\u0E8F', 'ဋ', 'ដ'],
    ['ඨ', 'ठ', 'ṭh', 'ฐ', '\u0E90', 'ဌ', 'ឋ'],
    ['ඩ', 'ड', 'ḍ', 'ฑ', '\u0E91', 'ဍ', 'ឌ'],
    ['ඪ', 'ढ', 'ḍh', 'ฒ', '\u0E92', 'ဎ', 'ឍ'],
    ['ණ', 'ण', 'ṇ', 'ณ', '\u0E93', 'ဏ', 'ណ'],
    // dental stops
    ['ත', 'त', 't', 'ต', 'ຕ', 'တ', 'ត'],
    ['ථ', 'थ', 'th', 'ถ', 'ຖ', 'ထ', 'ថ'],
    ['ද', 'द', 'd', 'ท', 'ທ', 'ဒ', 'ទ'],
    ['ධ', 'ध', 'dh', 'ธ', '\u0E98', 'ဓ', 'ធ'],
    ['න', 'न', 'n', 'น', 'ນ', 'န', 'ន'],
    // labial stops
    ['ප', 'प', 'p', 'ป', 'ປ', 'ပ', 'ប'],
    ['ඵ', 'फ', 'ph', 'ผ', 'ຜ', 'ဖ', 'ផ'],
    ['බ', 'ब', 'b', 'พ', 'ພ', 'ဗ', 'ព'],
    ['භ', 'भ', 'bh', 'ภ', '\u0EA0', 'ဘ', 'ភ'],
    ['ම', 'म', 'm', 'ม', 'ມ', 'မ', 'ម'],
    // liquids, fricatives, etc.
    ['ය', 'य', 'y', 'ย', 'ຍ', 'ယ', 'យ'],
    ['ර', 'र', 'r', 'ร', 'ຣ', 'ဟ', 'រ'],
    ['ල', 'ल', 'l', 'ล', 'ລ', 'သ', 'ល'],
    ['ව', 'व', 'v', 'ว', 'ວ', 'ဝ', 'វ'],
    ['ස', 'स', 's', 'ส', 'ສ', 'လ', 'ស'],
    ['හ', 'ह', 'h', 'ห', 'ຫ', 'ရ', 'ហ'],
    ['ළ', 'ळ', 'ḷ', 'ฬ', '\u0EAC', 'ဠ', 'ឡ']
];

const vowels = [
    // dependent vowel signs
    ['ා', 'ा', 'ā', 'า', 'າ', 'ာ', 'ា'],
    ['ි', 'ि', 'i', '\u0E34', '\u0EB4', 'ိ', 'ិ'],
    ['ී', 'ी', 'ī', '\u0E35', '\u0EB5', 'ီ', 'ី'],
    ['ු', 'ु', 'u', '\u0E38', '\u0EB8', 'ု', 'ុ'],
    ['ූ', 'ू', 'ū', '\u0E39', '\u0EB9', 'ူ', 'ូ'],
    ['ෙ', 'े', 'e', 'เ', 'ເ', 'ေ', 'េ'], //for th/lo - should appear in front
    ['ො', 'ो', 'o', 'โ', 'ໂ', 'ော', 'ោ'], //for th/lo - should appear in front
];
const sinh_conso_range = 'ක-ෆ';
const thai_conso_range = 'ก-ฮ';
const lao_conso_range = 'ກ-ຮ';

function beautify_sinh(text, script, rendType = '') {
    // change joiners before U+0DBA Yayanna and U+0DBB Rayanna to Virama + ZWJ
    return text.replace(/\u0DCA([\u0DBA\u0DBB])/g, '\u0DCA\u200D$1');
}
/**
 * Each script need additional steps when rendering on screen
 * e.g. for sinh needs converting dandas/abbrev, removing spaces, and addition ZWJ
 */
function beautify_common(text, script, rendType = '') {
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
function capitalize(text, script, rendType = '') {
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
function swap_e_o(text, script, rendType = '') { 
    if (script == Script.THAI) {
        return text.replace(/([ก-ฮ])([เโ])/g, '$2$1'); 
    } else if (script == Script.LAOS) {
        return text.replace(/([ກ-ຮ])([ເໂ])/g, '$2$1');
    }
    console.error(`Unsupported script ${script} for swap_e_o method.`);
}

const beautify_func = {
    [Script.SI]: [beautify_sinh, beautify_common],
    [Script.HI]: [],
    [Script.RO]: [beautify_common, capitalize],
    [Script.THAI]: [swap_e_o, beautify_common],
    [Script.LAOS]: [swap_e_o, beautify_common],
    [Script.MY]: [beautify_common],
    [Script.KM]: [beautify_common],
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
function insert_a(script, text) {
    text = text.replace(/([ක-ෆ])([^\u0DCF-\u0DDF\u0DCAa])/g, '$1a$2');
    text = text.replace(/([ක-ෆ])([^\u0DCF-\u0DDF\u0DCAa])/g, '$1a$2');
    return text.replace(/([ක-ෆ])$/g, '$1a'); // conso at the end of string not matched by regex above
}

const convert_to_func = {
    [Script.SI] : [],
    [Script.HI] : [convert_to],
    [Script.RO] : [insert_a, convert_to],
    [Script.THAI] : [convert_to],
    [Script.LAOS] : [convert_to],
    [Script.MY]: [convert_to],
    [Script.KM]: [convert_to],
}
const convert_from_func = {
    [Script.SI] : [],
    [Script.HI] : [convert_from]
}
function convert_to(script, text) {
    const hashMap = prepareHashMap(script_index[Script.SI], script_index[script]);
    return replaceByMap(text, hashMap);
}
function convert_from(script, text) {
    const hashMap = prepareHashMap(script_index[script], script_index[Script.SI]);
    return replaceByMap(text, hashMap);
}

class TextProcessor {
    /**
     * @param {string} text is the text in sinhala script
     * @param {Language} script 
     */
    static basicConvert(text, script) {
        convert_to_func[script].forEach(func => text = func(script, text));
        return text;
    }
    /* convert from another script to sinhala */
    static basicConvertFrom(text, script) {
        convert_from_func[script].forEach(func => text = func(script, text));
        return text;
    }
    // text is not in sinhala script
    static beautify(text, script, rendType = '') {
        beautify_func[script].forEach(func => text = func(text, script, rendType));
        return text;
    }
    static convert(text, script) {
        text = this.basicConvert(text, script);
        return this.beautify(text, script);
    }
}

// for es6 - browser
export {TextProcessor};

// for node
//module.exports = {TextProcessor: TextProcessor};

//let testDev = '॥ नमो तस्स भगवतो अरहतो सम्मासम्बुद्धस्स॥';
//console.log(deva_sinh(testDev));

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