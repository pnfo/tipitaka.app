import { Script, TextProcessor } from './pali-script.js';
import { appSettings, UT } from './settings.js';
import { PitakaTree } from './pitaka-tree.js';
import { Util, JDialog } from './util.js';
import { dictClient } from './dict-client.js';

const pageTagNames = new Map([
    ['T', 'Thai'],
    ['M', 'Myanmar'],
    ['V', 'VRI'],
    ['P', 'PTS']
]);

const abbreviations_si = new Map([ // converted from the roman ones below
    ["අ", "අඞ්ගුත්තරනිකායපාලි"],
    ["අට්ඨ", "අට්ඨකථා"],
    ["චූළනි", "චූළනිද්දෙසපාලි"],
    ["දී", "දීඝනිකායපාලි"],
    ["ඉතිවු", "ඉතිවුත්තකපාලි"],
    ["ජා", "ජාතකපාලි"],
    ["කං", [{ UT: 'Cambodian Edition' }] ],
    ["ක", [{ UT: 'Cambodian Edition' }] ],
    ["ඛු", "ඛුද්දකනිකායපාලි"],
    ["ම", "මජ්ඣිමනිකායපාලි"],
    ["මහානි", "මහානිද්දෙසපාලි"],
    ["මහාව", "මහාවංස"],
    ["මොග", "මොග්ගල්ලානබ්යාකරණං (?)"],
    ["මු", "මූල (?)"],
    ["නි", "නිකාය"],
    ["ප", "පටිසම්භිදාමග්ගපාලි/ පට්ඨානපාලි"],
    ["පී", [{ UT: 'Pali Text Society Edition' }] ],
    ["පෙ", "පෙතවත්ථුපාලි/ පෙටකොපදෙසපාලි / පෙය්යාල"],
    ["පු", "පුග්ගලපඤ්ඤත්තිපාලි"],
    ["පාචි", "පාචිත්තියපාලි"],
    ["පාරා", "පාරාජිකකණ්ඩපාලි"],
    ["රූ", "රූපාවචර(?)"],
    ["සං", "සංයුත්තනිකායපාලි"],
    ["සී", [{ UT: 'Sri Lankan Edition' }] ],
    ["ස්‍යා", [{ UT: 'Thai Edition' }] ],
    ["සු", "සුත්තපිටක/ සුත්තං (?)"],
    ["ථෙරගා", "ථෙරගාථාපාලි"],
    ["උදා", "උදානපාලි"],
    ["වි", "විමානවත්ථුපාලි"],
    ["විසුද්ධි", "විසුද්ධිමග්ග"],
    ["ටී", "ටීකා"],
    ["වා අස්ස", [
        { PT: '“තස්ස එවං අයොනිසො මනසිකරොතො ඡන්නං දිට්ඨීනං අඤ්ඤතරා දිට්ඨි උප්පජ්ජති. ‘අත්ථි මෙ අත්තා’ති වා අස්ස, සච්චතො ථෙතතො දිට්ඨි උප්පජ්ජති; ‘නත්ථි මෙ අත්තා’ති වා අස්ස සච්චතො ථෙතතො දිට්ඨි උප්පජ්ජති; (මජ්ඣිමනිකාය, මූලපණ්ණාසපාලි, 1.11).'},
        { UT: 'Here vā= or, an indeclinable and a conjunction. Assa= tassa= to him/ his. In some editions a sandhi is made as vā+assa= vāssa.'}]
    ],
]);

//const digitZero = '0०๐໐၀០'; // distinct chars from the 0 line in pali specials
//const isUniversalZero = (num) => digitZero.indexOf(num) != -1;
//const stripLeadingZeros = (str) => str.replace(new RegExp(`^[${digitZero}]+`, 'g'), ''); 

export class PageTag {
    static registerEvents(fd) {
        fd.root.on('click', 'pb', e => PageTag.showPageTagBox(e));
    }
    static render(span) {
        if (appSettings.get('pageTagFormat') == 'none') {
            span.children('pb').remove();
        } else { // full, short
            span.children('pb').each((_1, pb) => PageTag.getPageTagDisplay($(pb)));
        }
    }
    static getPageTagDisplay(pb) {
        const [tagS, tagL, book, page] = PageTag.decodeAttr(pb);
        if (appSettings.get('pageTagFormat') == 'click') {
            pb.text('¶').addClass('click');
        } else if (appSettings.get('pageTagFormat') == 'short') {
            pb.text(`[${tagS}: ${book}.${page}]`);
        } else {
            pb.html(`[<i>${tagL}</i> ${book}.${page}]`);
        }
        pb.addClass(tagS);
    }
    static showPageTagBox(e) {
        const pb = $(e.currentTarget);
        const [tagS, tagL, book, page] = PageTag.decodeAttr(pb);
        
        $('#pagetag-book').text(book).parent().toggle(book ? true : false);
        $('#pagetag-page').text(page);
        $('#pagetag-edition').text(tagL);
        Util.showDialog('pagetag-dialog', '', pb);
    }
    static decodeAttr(pb) {
        let tag, pbAttrVal;
        for(let entry of pageTagNames) {
            if (pbAttrVal = pb.attr(entry[0])) {
                tag = entry;
                break;
            }
        }
        let [book, page] = pbAttrVal.split('.');
        return [tag[0], tag[1], book, page];
    }
}

export class Note {
    static registerEvents(fd) {
        fd.root.on('click', 'n.click', e => Note.showNoteBox(e, fd.script))
            .on('click', 'abbr', e => Note.showAbbrBox(e, fd.script));
    }
    
    static render(span) {
        if (appSettings.get('footnoteFormat') == 'none') {
            span.children('n').remove();
        } else if (appSettings.get('footnoteFormat') == 'click') {
            span.children('n').each((_1, n) => {
                $(n).attr('text', $(n).text()).empty().addClass('click');
            });
        } else { // inline
            span.children('n').each((_1, n) => $(n).html(`[${ Note.noteTextToHtml($(n).text()) }]`));
        }
    }
    static noteTextToHtml(text) {
        return text.replace(/([^\s\(]+?[·॰])/g, `<abbr>$1</abbr>`);
    }
    static showAbbrBox(e, targetScript) {
        const abbr = $(e.currentTarget);
        let siAbbr = TextProcessor.convertFrom(abbr.text().slice(0, -1), targetScript);
        siAbbr = TextProcessor.beautify(siAbbr, Script.SI); // since the convertFrom above does not do the beautification
        const abbrText = abbreviations_si.get(siAbbr);
        if (!abbrText) {
            console.error(`Could not find the abbreviation for the abbr ${siAbbr}`);
            return;
        }
        let itemsToShow = [];
        if (typeof abbrText != 'string') { // for each item in the list create an element
            itemsToShow = abbrText.map(abbrItem => {
                if (abbrItem['PT']) return Note.getAbbrFromPT(abbrItem['PT'], targetScript);
                if (abbrItem['UT']) return UT(abbrItem['UT']);
            });
        } else {
            itemsToShow.push(Note.getAbbrFromPT(abbrText, targetScript))
        }
        Util.showDialog('abbreviations-dialog', itemsToShow, abbr);
    }
    static getAbbrFromPT(abbrText, targetScript) {
        return $('<i/>').addClass('PT').attr('script', targetScript)
            .text(TextProcessor.convert(abbrText, targetScript));
    }

    static showNoteBox(e, script) {
        console.log(script);
        const note = $(e.currentTarget);
        const newNote = $('<n/>').addClass('PT').attr('script', script)
            .html(Note.noteTextToHtml(note.attr('text')));
        Util.showDialog('generic-dialog', newNote, note);
        newNote.on('click', 'abbr', e => Note.showAbbrBox(e, script));
    }
}

export class Collection {
    constructor(collObj, root, fileId, appTabs) {
        this.collObj = collObj;
        this.root = root;
        this.fileId = fileId;
        this.tabs = appTabs;
        this.registerClicks();
    }
    registerClicks() {
        this.root.on('click', '.coll-button', e => {
            const newT = PitakaTree.filterCollection(this.collObj, $(e.currentTarget).attr('na'));
            //console.log(newT);
            this.tabs.newTab(newT[2], newT[1], this.collObj);
        }); /*.parent().scroll(e => {
            this.buttons.css('top', this.root.parent().scrollTop() + 10);
            console.log(this.buttons.offset());
        });*/
    }
    renderTop() {
        this.buttons = $(`<div class="coll-buttons top"/>`).appendTo(this.root);
        this.collObj.n.filter(v => v[2] != this.fileId).forEach(v => {
            const na = v[0].toUpperCase();
            $(`<span class="coll-button ${na.charAt(0)}" na="${na.toLowerCase()}">${na}</span>`).appendTo(this.buttons);
            //$('<span/>').addClass(['coll-button', na.charAt(0)]).text(na).attr('na', na.toLowerCase()).appendTo(this.buttons);
        });
    }
    renderOnClick() {
        // add some paranum or linenum to coll-button
    }
    
}

export class LinkHandler {
    constructor(fileDisplay) {
        this.fileDisplay = fileDisplay;
        this.root = this.fileDisplay.root;
        this.registerClicks();
    }
    static initClipboard() {
        const clipb = new ClipboardJS('.share-icon', {
            text: function(trigger) {
                const icon = $(trigger), root = icon.parents('.tab-content');
                const line = icon.parents('[line-ind]').first().attr('line-ind');
                const link = LinkHandler.createLink(root.attr('file-id'), line, root.attr('script'));
                return link;
            }
        });
        clipb.on('success', e => Util.showToast(UT('copy-link')));
    }
    registerClicks() {
        /*this.root.on('click', '.share-icon', e => {
            const icon = $(e.currentTarget);
            const line = icon.parents('[line-ind]').first().attr('line-ind');
            const link = LinkHandler.createLink(this.root.attr('file-id'), line, this.root.attr('script'));
            Util.copyText(link);
            Util.showToast(UT(stringResources['copy-link']));
        });*/
    }
    
    openAndHighlightLine(lineToOpen) {
        if (!lineToOpen) { // no line to open
            return;
        }
        const lineDiv = this.root.children(`[line-ind=${lineToOpen}]`).first();
        if (!lineDiv) return; // non-existant line-ind

        lineDiv.addClass('highlighted-line'); //css('background-color', 'lightyellow'); // highlight
        this.openDivToShowLine(lineDiv);
        this.fileDisplay.scrollToDiv(lineDiv);
    }
    openDivToShowLine(lineDiv) {
        // get the title div previous to the para
        const titleDiv = lineDiv.is('[tt]') ? lineDiv : lineDiv.prevAll('[tt]').first();
        /*const rendType = lineDiv.attr('class').split(' ')[0];
        let titleDiv = lineDiv;
        if ($.inArray(rendType, ['bod', 'gax', 'gae']) >= 0) { // para
            titleDiv = lineDiv.prevAll('[tt]').first(); // get the title div previous to the para
        }*/
        if (titleDiv && !titleDiv.hasClass('open')) {
            this.fileDisplay.openTitleDiv(titleDiv);
        }
    }
    openHighlightedLines() {
        let smallestLineInd = 1e10; // a big number
        this.root.find('found').parents('[line-ind]').each((_1, lineDiv) => {
            this.openDivToShowLine($(lineDiv));
            smallestLineInd = Math.min($(lineDiv).attr('line-ind'), smallestLineInd);
        });
        this.fileDisplay.scrollToDiv(this.root.children(`[line-ind=${smallestLineInd}]`));
    }
    static createLink(fileId, lineInd, script) {
        return `https://tipitaka.app/?a=${fileId}-${lineInd}-${script}`;
    }

    // url format tipitaka.app/?a=ab1-323-th
    static tryStartupLocation(appTree, appTabs) {
        const params = Util.getParameterByName('a', '').split('-'); 
        if (!params) return false;
        let [fileId, lineId, spt] = params;

        // TODO script from url is ignored at this point - script is either from storage or gps
        /*if (spt && Script[spt] && appSettings.paliScriptSource == 'gps-or-url') {
            appSettings.set('paliScript', spt); // if user has selected a script before do not override
        }*/

        if (!$.isNumeric(lineId)) {
            lineId = 0;
        }
        if (fileId && !appTree.fileIdToColl[fileId]) {
            showToast(`Can not open direct link. Malformed file id ${fileId}`);
        } else if (fileId) { // try to open location
            const coll = appTree.getCollection(fileId);
            const newT = PitakaTree.filterCollection(coll, fileId);
            appTree.openBranch(fileId);
            appTabs.newTab(fileId, newT[1], coll, { lineToOpen: Number(lineId) });
            return true;
        }
        return false;
    }
}

export class HitHighlighter {
    /**
     * Three step process to mark the offset locations in the text in fileDisplay
     * 1) insert a special character to the beginnings of words
     * 2) run the tokenizer with the same settings and mark the locations of special chars which has a hit
     * 3) add the <found> tag to locations in the original text which have marked special chars
     */
    static markOffsets(dataStr, highlight) {
        // NOTE: tokenizer code below that compute the offsets should match exactly with the tokenizer in dev

        // remove all punctuation marks, digits, ascii range, danda
        // remove notes too - seaching exact matches over the notes
        // TODO move to a common location
        const tokenizerFilterRegex = 
        /<n>.+?<\/n>|[\u0964\u0965\u0970]|[A-Za-z0-9\.\?\,!;'"‘’“”–<>=\:\\\/\[\]\+\(\)]/g;
        // new lines … and - also used to split the words
        // § is used inside the <note> sometimes 
        const tokenizerSplitRegex = /[-…§\s\r\n]+/g;

        const offsetsMap = new Map(); // assumption - no duplicate offsets
        highlight.offsets.forEach((offsets, offInd) => 
            offsets.forEach((offset, termInd) => offsetsMap.set(offset, [offInd, termInd])));

        // insert special char where a civ is followed by a not sinhala letter (possible starts of sinhala words)
        // dont need to do this inside notes because tokenizer removes notes - so remove sp char inside the notes
        dataStr = dataStr.replace(/([^ം-ෟ])([අ-ෆ])/g, '$1෴$2')
            .replace(/<n>(.+?)<\/n>/g, (m, p1) => `<n>${p1.replace(/෴/g, '')}</n>`);

        // perform the same tokenizer process so that the offsets would match
        const tokenText = dataStr.replace(tokenizerFilterRegex, '');
        const tokens = tokenText.replace(tokenizerSplitRegex, ' ').split(' ');
        let spcCount = 0;
        const tagLocations = new Map();
        tokens.forEach((token, offset) => {
            // if offset need to be highlighted, mark it in the tagLocations
            if (offsetsMap.has(offset)) {
                tagLocations.set(spcCount, offsetsMap.get(offset));
                if (highlight.words[offsetsMap.get(offset)[1]] != token.substring(1)) { // error checking
                    console.log(`token ${token.substring(1)} at offset ${offset} not matching with word ${highlight.words[offsetsMap.get(offset)[1]]}`);
                }
            }
            // count the number of times special char () is occuring and keep track of it
            spcCount += (token.match(/෴/g) || []).length;
        });
        console.log(`spcCount: ${spcCount}, offsetsMap: ${offsetsMap.size} tagLocations Found: ${tagLocations.size}`);

        let spcCount2 = 0, tagsMarked = 0;
        dataStr = dataStr.replace(/෴([^-…§\s\r\n<෴]*)/g, (m, p1, o) => { // assume that replace function will be called in order
            spcCount2++;
            if (tagLocations.has(spcCount2 - 1)) {
                tagsMarked++;
                const tagData = tagLocations.get(spcCount2 - 1);
                return `<found oi="${tagData[0]}" ti="${tagData[1]}">${p1}</found>`;
            }
            return p1; // remove the un-necessary (un-marked) special char
        });
        console.log(`TagLocations marked: ${tagsMarked} spcCount2: ${spcCount2}`);
        return dataStr;
    }
}

// this class is not used anymore
/*export class WordDisplay {
    constructor(fileDisplay) {
        this.fileDisplay = fileDisplay;
        this.root = this.fileDisplay.root;
        this.registerClicks();
        this.settings = { hoverDelay: 500 };
        this.hoverTimer = null;
    }
    registerClicks() {
        this.root.on('mouseenter', 'w', e => this.registerShowInfo(e, 'hover'))
        .on('mouseleave', 'w', e => {
            if (this.hoverTimer) clearTimeout(this.hoverTimer);
            this.closeInfoBox();
        }).on('click', 'w', e => this.registerShowInfo(e, 'click'));
    }
    registerShowInfo(e, eventType) {
        if (appSettings.get('dictLaunchMethod') != eventType) return; // not show on this event
        if (!dictClient.activeDicts.size) return; // no dicts selected by user
        if (this.dictDlg && this.dictDlg.isOpen) return; // prevent new dialogs if one is already shown
        const wElem = $(e.currentTarget);
        if (wElem.parents('[tt]').length) return;
        if (this.hoverTimer) clearTimeout(this.hoverTimer);
        if (eventType == 'hover') {
            this.hoverTimer = setTimeout(() => this.showInfoBox(wElem), this.settings.hoverDelay);
        } else {
            this.showInfoBox(wElem);
        }
    }
    showInfoBox(wElem, inputVal = '') {
        const word = inputVal || wElem.text();
        dictClient.searchWordInline(word, this.fileDisplay.script).then(entries => {
            // if have entries directly display them, otherwise show an edit box with the text
            if (entries.length) {
                const table = $('<div/>').append(entries).css('padding', '0.33rem').addClass('dict-inline');
                if (this.dictDlg) this.dictDlg.close();
                this.dictDlg = new JDialog(wElem, wElem, {'max-width': 400, top: '100%'}).show(table, this.root);
                if (table.width() > 380) { // hack
                    $('.dict-row', table).css('white-space', 'normal');
                }
            } else if (!this.wordEditDlg || !this.wordEditDlg.isOpen) { // do not show the editbox a second time
                const inputBox = $('<input/>').addClass('PT type-word').attr('type', 'text').val(wElem.text())
                    .attr('script', this.fileDisplay.script).css('padding', '0.33rem');
                this.wordEditDlg = new JDialog(wElem, wElem, {bottom: '100%'}).show(inputBox, this.root);
                inputBox.focus().on('input', e => inputBox.val() ? this.showInfoBox(wElem, inputBox.val()) : '');
            }
            
        }).catch(err => {
            console.error(`Error searching word ${word} : ${err}`);
        });
    }
    closeInfoBox() {
        if (this.dictDlg && this.dictDlg.isOpen) this.dictDlg.close();
        if (this.wordEditDlg && this.wordEditDlg.isOpen) this.wordEditDlg.close();
    }
    // create words - will be called after markOffsets above if any
    markWords(dataStr) {
        return dataStr.replace(/([ം-ෟ]+)/g, `<w>$1</w>`); // (?!॰) consescutive sinhala range
    }
}*/

// the original roman abbreviations list from VRI
// not used - just for reference
const abbreviations_ro = new Map([
    ['a', 'aṅguttaranikāyapāli'],
    ['aṭṭha', 'aṭṭhakathā'],
    ['cūḷani', 'cūḷaniddesapāli'],
    ['dī', 'dīghanikāyapāli'],
    ['itivu', 'itivuttakapāli'],
    ['jā', 'jātakapāli'],
    ['kaṃ', [{ UT: 'Cambodian Edition' }] ],
    ['ka', [{ UT: 'Cambodian Edition' }] ],
    ['khu', 'khuddakanikāyapāli'],
    ['ma', 'majjhimanikāyapāli'],
    ['mahāni', 'mahāniddesapāli'],
    ['mahāva', 'mahāvaṃsa'],
    ['moga', 'moggallānabyākaraṇaṃ (?)'],
    ['mu', 'mūla (?)'],
    ['ni', 'nikāya'],
    ['pa', 'paṭisambhidāmaggapāli/ paṭṭhānapāli'],
    ['pī', [{ UT: 'Pali Text Society Edition' }] ],
    ['pe', 'petavatthupāli/ peṭakopadesapāli / peyyāla'],
    ['pu', 'puggalapaññattipāli'],
    ['pāci', 'pācittiyapāli'],
    ['pārā', 'pārājikakaṇḍapāli'],
    ['rū', 'rūpāvacara(?)'],
    ['saṃ', 'saṃyuttanikāyapāli'],
    ['sī', [{ UT: 'Sri Lankan Edition' }] ],
    ['su', 'suttapiṭaka/ suttaṃ (?)'],
    ['syā', [{ UT: 'Thai Edition' }] ],
    ['theragā', 'theragāthāpāli'],
    ['udā', 'udānapāli'],
    ['vi', 'vimānavatthupāli'],
    ['visuddhi', 'visuddhimagga'],
    ['ṭī', 'ṭīkā'],
    ['vā assa', [
        { PT: '“Tassa evaṃ ayoniso manasikaroto channaṃ diṭṭhīnaṃ aññatarā diṭṭhi uppajjati. ‘Atthi me attā’ti vā assa, saccato thetato diṭṭhi uppajjati; ‘natthi me attā’ti vā assa saccato thetato diṭṭhi uppajjati; (majjhimanikāya, mūlapaṇṇāsapāli, page 1.11).'},
        { UT: 'Here vā= or, an indeclinable and a conjunction. Assa= tassa= to him/ his. In some editions a sandhi is made as vā+assa= vāssa.'}]
    ],
]);
