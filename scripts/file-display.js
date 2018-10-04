import { TextProcessor } from './pali-script.mjs';
import { appSettings } from './settings.js';
import { PageTag, Note, Collection, LinkHandler, HitHighlighter, WordDisplay } from './note-tag.js';
import { bookmarks } from './title-search.js';

function Uint16ArrayToString(u16Arr) {
    const CHUNK_SZ = 0x8000;
    const c = [];
    for (let i = 0; i < u16Arr.length; i += CHUNK_SZ) {
      c.push(String.fromCharCode.apply(null, u16Arr.subarray(i, i+CHUNK_SZ)));
    }
    return c.join('');
}

const titleTypes = new Map([ ['cha', '1-2-3'], ['tit', '1-2'], ['sub', '1'] ]);
export class FileDisplay {
    constructor(elem, appTabs, fileId, collObj, highlight) {
        this.root = elem;
        this.fileId = fileId;
        this.collection = new Collection(collObj, this.root, this.fileId, appTabs);
        this.linkHandler = new LinkHandler(this);
        this.wordDisplay = new WordDisplay(this);
        this.lineToOpen = highlight.lineToOpen || 0;
        this.highlight = highlight;
        this.data = ''; // raw text in sinhala script
        this.script = appSettings.get('paliScript'); // per tab script
        this.registerEvents();
    }
    load() {
        const oReq = new XMLHttpRequest();
        oReq.open('GET', `../static/text/${this.fileId}.txt`, true);
        oReq.responseType = "arraybuffer";
        oReq.onload = (oEvent) => {
            this.data = Uint16ArrayToString(new Uint16Array(oReq.response));
            if (this.highlight.words) {
                this.data = HitHighlighter.markOffsets(this.data, this.highlight);
            }
            this.data = this.wordDisplay.markWords(this.data);
            this.refresh();
            this.linkHandler.openAndHighlightLine(this.lineToOpen);
            if (this.highlight.words) this.linkHandler.openHighlightedLines();
        };
        oReq.send();
    }
    registerEvents() {
        Note.registerEvents(this);
        PageTag.registerEvents(this);
        this.root.on('click', '[tt] .line-text', e => {
            const div = $(e.currentTarget).parent();
            this.openTitleDiv(div);
            this.scrollToDiv(div);
        }).on('click', '.hangnum,.titnum', e => this.collection.renderOnClick(e));
    }
    openTitleDiv(div) { // can be static too
        const lines = div.toggleClass('open').nextUntil(`[tt|=${div.attr('tt')}]`);
        lines.filter(':not([tt])').toggle(div.hasClass('open'));
        lines.filter('[tt]').toggleClass('open', div.hasClass('open'));
    }
    scrollToDiv(div) {
        if (!div) return;
        this.root.scrollTop(this.root.scrollTop() + div.position().top);
    }
    changeScript() {
        if (this.script != appSettings.get('paliScript')) {
            this.script = appSettings.get('paliScript');
            this.refresh();
        }
    }
    refresh() { // change script, abbre and pageTags
        this.root.empty().attr('script', this.script);
        //this.root.append($('<div/>').text(JSON.stringify(this.collection)));
        const lines = TextProcessor.basicConvert(this.data, this.script).split('\r\n');
        lines.forEach((line, ind) => {
            this.root.append(this.getDivForLine(line, ind));
        });
        if (this.root.find('[tt]').length == 1) { // if only one title element keep it open
            this.root.find('[tt]').children('.line-text').click();
        }
        this.root.children('.cha').first().prevUntil().show(); // show namo, nik, boo
        this.collection.renderTop();
    }
    
    getDivForLine(line, ind) {
        const [rendType, paraNum, text] = this.lineToParts(line);
        const div = $('<div/>').addClass(rendType).attr('line-ind', ind + 1);
        const textLine = this.textLineRender(text, rendType);
        const shareIcon = $('<i/>').addClass('far fa-share share-icon action-icon');
        if (titleTypes.has(rendType)) {
            if (paraNum) $('<span/>').addClass('titnum').text(paraNum + '.').appendTo(div);
            const saveIcon = bookmarks.getIcon(this.fileId, ind + 1);
            div.attr('tt', titleTypes.get(rendType)).append(textLine, shareIcon, saveIcon);
        } else {
            if (paraNum) {
                $('<span/>').addClass(`hangnum ${paraNum.length > 4 ? 'long' : ''}`)
                .text(paraNum + '.').append(shareIcon).appendTo(div);
            } else if ($.inArray(rendType, ['bod', 'gax', 'gae']) >= 0) {
                $('<span/>').addClass('hangnum').appendTo(div); // just for the first line indent in bod,gax,gae
            }
            div.append(textLine).hide();
        }
        return div;
    }
    lineToParts(line) {
        const parts = line.split(':');
        if (line && (parts.length < 2 || parts.length > 3)) {
            console.log(`malformed line ${line} in file ${this.fileId}`);
        }
        return [parts[0], parts.length > 2 ? parts[1] : '', parts[parts.length-1]];
    }
    /**
     * convert the text to beautiful html based on the script selected and other settings
     * <n> and <pd> tags. converting dandas/abbrev, removing spaces, and addition ZWJ
     * @param {String} text 
     */
    textLineRender(text, rendType = '') {
        text = TextProcessor.beautify(text, this.script, rendType);
        const span = $('<span/>').addClass('line-text').html(text);
        // Notes and page tag rendering according to the settings
        Note.render(span);
        PageTag.render(span);
        
        return span;
    }

}


