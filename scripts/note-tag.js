import { appSettings } from './settings.js';

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
        if (appSettings.pageTagFormat == 'none') {
            span.children('pd').remove();
        } else { // full, short
            span.children('pd').each((_1, pd) => PageTag.getPageTagDisplay($(pd)));
        }
    }
    static getPageTagDisplay(pd) {
        let tag, page;
        for(let entry of pageTagNames) {
            if (page = pd.attr(entry[0])) {
                tag = entry;
                break;
            }
        }
        page = page.split('.');
        const book = isUniversalZero(page[0]) ? '' : `${page[0]}.`;
        if (appSettings.pageTagFormat == 'click') {
            pd.text('¶').addClass('click');
        } else if (appSettings.pageTagFormat == 'short') {
            pd.text(`[${tag[0]}: ${book}${stripLeadingZeros(page[1])}]`);
        } else {
            pd.html(`[<i>${tag[1]}</i> ${book}${stripLeadingZeros(page[1])}]`);
        }
        pd.addClass(tag[0]);
    }
}

export class Note {
    static render(span) {
        if (appSettings.footnoteFormat == 'none') {
            span.children('n').remove();
        } else if (appSettings.footnoteFormat == 'click') {
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
            const na = $(e.currentTarget).attr('na');
            const newT = this.collObj.n.filter(v => v[0] == na)[0];
            console.log(newT);
            this.tabs.newTab(newT[2], newT[1], this.collObj);
        }); /*.parent().scroll(e => {
            this.buttons.css('top', this.root.parent().scrollTop() + 10);
            console.log(this.buttons.offset());
        });*/
    }
    renderTop() {
        this.buttons = $('<div/>').addClass('coll-buttons top').appendTo(this.root);
        this.collObj.n.filter(v => v[2] != this.fileId).forEach(v => {
            const na = v[0].toUpperCase();
            $('<span/>').addClass(['coll-button', na.charAt(0)]).text(na).attr('na', na.toLowerCase()).appendTo(this.buttons);
        });
    }
    renderOnClick() {
        // add some paranum or linenum to coll-button
    }
}