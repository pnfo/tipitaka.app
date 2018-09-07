import { Script } from './pali-script.js';
import { appSettings, stringResources, UT } from './settings.js';
import { PitakaTree } from './pitaka-tree.js';
import { Util } from './util.js';

const pageTagNames = new Map([
    ['T', 'Thai'],
    ['M', 'Myanmar'],
    ['V', 'VRI'],
    ['P', 'PTS']
]);
const digitZero = '0०๐໐၀០'; // distinct chars from the 0 line in pali specials
const isUniversalZero = (num) => digitZero.indexOf(num) != -1;
const stripLeadingZeros = (str) => str.replace(new RegExp(`^[${digitZero}]+`, 'g'), ''); 

export class PageTag {
    static render(span) {
        if (appSettings.get('pageTagFormat') == 'none') {
            span.children('pb').remove();
        } else { // full, short
            span.children('pb').each((_1, pb) => PageTag.getPageTagDisplay($(pb)));
        }
    }
    static getPageTagDisplay(pb) {
        let tag, page;
        for(let entry of pageTagNames) {
            if (page = pb.attr(entry[0])) {
                tag = entry;
                break;
            }
        }
        page = page.split('.');
        //const book = isUniversalZero(page[0]) ? '' : `${page[0]}.`;
        const book = page[0] ? `${page[0]}.` : '';
        if (appSettings.get('pageTagFormat') == 'click') {
            pb.text('¶').addClass('click');
        } else if (appSettings.get('pageTagFormat') == 'short') {
            //pb.text(`[${tag[0]}: ${book}${stripLeadingZeros(page[1])}]`);
            pb.text(`[${tag[0]}: ${book}${page[1]}]`);
        } else {
            //pb.html(`[<i>${tag[1]}</i> ${book}${stripLeadingZeros(page[1])}]`);
            pb.html(`[<i>${tag[1]}</i> ${book}${page[1]}]`);
        }
        pb.addClass(tag[0]);
    }
}

export class Note {
    static render(span) {
        if (appSettings.get('footnoteFormat') == 'none') {
            span.children('n').remove();
        } else if (appSettings.get('footnoteFormat') == 'click') {
            span.children('n').each((_1, n) => {
                $(n).attr('text', $(n).text()).empty().addClass('click');
            });
        } else { // inline
            span.children('n').each((_1, n) => $(n).text(`[${$(n).text()}]`));
        }
    }
    
    static showNoteBox(e) {
        const note = $(e.currentTarget);
        alert(note.attr('text'));
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
            console.log(newT);
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
        clipb.on('success', e => Util.showToast(UT(stringResources['copy-link'])));
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

        lineDiv.css('background-color', 'lightyellow'); // highlight
        const rendType = lineDiv.attr('class').split(' ')[0];
        let titleDiv = lineDiv;
        if ($.inArray(rendType, ['bod', 'gax', 'gae']) >= 0) { // para
            titleDiv = lineDiv.prevAll('[tt]').first(); // get the title div previous to the para
        }
        if (!titleDiv.hasClass('open')) {
            this.fileDisplay.openTitleDiv(titleDiv);
        }
        this.fileDisplay.scrollToDiv(lineDiv);
    }
    static createLink(fileId, lineInd, script) {
        return `https://tipitaka.app/?a=${fileId}-${lineInd}-${script}`;
    }

    // url format tipitaka.app/?a=ab1-323-th
    static tryStartupLocation(appTree, appTabs) {
        const params = Util.getParameterByName('a', '').split('-'); //, lineId = getParameterByName('l', 0),            spt = getParameterByName('s', '');
        if (!params) return false;
        let [fileId, lineId, spt] = params;

        if (spt && Script[spt] && appSettings.paliScriptSource == 'default') {
            appSettings.set('paliScript', spt); // if user has selected a script before do not override
        }

        if (!$.isNumeric(lineId)) {
            lineId = 0;
        }
        if (fileId && !appTree.fileIdToColl[fileId]) {
            showToast(`Can not open direct link. Malformed file id ${fileId}`);
        } else if (fileId) { // try to open location
            const coll = appTree.getCollection(fileId);
            const newT = PitakaTree.filterCollection(coll, fileId);
            appTree.openBranch(fileId);
            appTabs.newTab(fileId, newT[1], coll, Number(lineId));
            return true;
        }
        return false;
    }
}