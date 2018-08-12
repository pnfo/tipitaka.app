import { textProcessor } from './pali-script.js';
import { appSettings } from './settings.js';

function Uint16ArrayToString(u16Arr) {
    const CHUNK_SZ = 0x8000;
    const c = [];
    for (let i = 0; i < u16Arr.length; i += CHUNK_SZ) {
      c.push(String.fromCharCode.apply(null, u16Arr.subarray(i, i+CHUNK_SZ)));
    }
    return c.join('');
}

/**
 * Macro function to get the pali text in the selected script in settings
 * param text - should be the text in sinhala script
 */
export function PT(text) {
    const pt = $('<i/>').addClass('PT').attr('si-text', text).attr('lang', appSettings.paliScript);
    return pt.text(textProcessor.convert(text, appSettings.paliScript));
}
// change language of all PT in the root
export function PT_REFRESH(root) {
    $('i.PT', root).each((_1, pt) => {
        let text = $(pt).attr('si-text');
        text = textProcessor.convert(text, appSettings.paliScript);
        $(pt).text(text).attr('lang', appSettings.paliScript);
    });
}

export class FileDisplay {
    constructor(elem, fileId) {
        this.root = elem;
        this.fileId = fileId;
        this.data = ''; // raw text in sinhala script
        this.script = appSettings.paliScript; // per tab script
    }
    load() {
        const oReq = new XMLHttpRequest();
        oReq.open('GET', `../static/text/${this.fileId}.txt`, true);
        oReq.responseType = "arraybuffer"
        oReq.onload = (oEvent) => {
            this.data = Uint16ArrayToString(new Uint16Array(oReq.response));
            this.refresh();
        };
        oReq.send();
    }
    changeScript() {
        if (this.script != appSettings.paliScript) {
            this.script = appSettings.paliScript;
            this.refresh();
        }
    }
    refresh() { // change script
        this.root.empty().attr('lang', this.script);
        const lines = textProcessor.basicConvert(this.data, this.script).split('\r\n');
        lines.forEach(line => {
            this.root.append(this.getDivForLine(line));
        });
    }
    getDivForLine(line) {
        const [rendType, paraNum, text] = this.lineToParts(line);
        const div = $('<div/>').addClass(rendType);
        if (paraNum) {
            $('<span/>').addClass('hangnum').text(paraNum + '.').appendTo(div);
        }
        this.textLineRender(text, rendType).appendTo(div);
        return div;

    }
    lineToParts(line) {
        const parts = line.split(':');
        if (parts.length < 2 || parts.length > 3) {
            console.log(`malformed line ${line} in file ${this.fileId}`)
        }
        return [parts[0], parts.length > 2 ? parts[1] : '', parts[parts.length-1]];
    }
    /**
     * convert the text to beautiful html based on the script selected and other settings
     * <n> and <pd> tags. converting dandas/abbrev, removing spaces, and addition ZWJ
     * @param {String} text 
     */
    textLineRender(text, rendType = '') {
        text = textProcessor.beautify(text, this.script, rendType);
        const span = $('<span/>').addClass('line-text').html(text);
        // Notes rendering
        if (appSettings.abbreFormat == 'none') {
            span.children('n').remove();
        } else if (appSettings.abbreFormat == 'click') {
            span.children('n').each((_1, n) => {
                $(n).attr('text', $(n).text()).empty().addClass('click');
            });
        } else { // inline
            span.children('n').each((_1, n) => $(n).text(`[${$(n).text()}]`));
        }
        // pageTags rendering
        if (appSettings.pageTagFormat == 'none') {
            span.children('pd').remove();
        } else { // full, short
            span.children('pd').each((_1, pd) => this.getPageTagDisplay($(pd)));
        }
        return span;
    }
    getPageTagDisplay(pd) {
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

const pageTagNames = new Map([
    ['T', 'Thai'],
    ['M', 'Myanmar'],
    ['V', 'VRI'],
    ['P', 'PTS']
]);
const digitZero = '0०๐'; // distinct chars from the 0 line in pali specials
const isUniversalZero = (num) => digitZero.indexOf(num) != -1;
const stripLeadingZeros = (str) => str.replace(new RegExp(`^[${digitZero}]+`, 'g'), ''); 
