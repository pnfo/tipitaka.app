"use strict";

export class Util {
    static copyText(copyText) {
        const el = document.createElement('textarea');
        el.value = copyText;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);   
    }
    static showToast(toastMsg) {
        var toast = $('#toast').html(toastMsg).fadeIn(300);
        // After 3 seconds, remove the show class from DIV
        setTimeout(function(){ toast.fadeOut(); }, 2000);
    }

    static getParameterByName(name, defVal) {
        name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
        var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
            results = regex.exec(location.search);
        return results === null ? defVal : decodeURIComponent(results[1].replace(/\+/g, " "));
    }

    static createLanguageSelectOption(lang, info, flagFolder = './static/images/') {
        const span = $('<span/>').addClass('UT').text(info[1]).attr('lang', lang);
        const img = info[3].f ? $('<img/>').attr('src', `${flagFolder}${info[3].f}`) : '';
        const option = $('<div/>').addClass('option').append(span, img).attr('value', lang);
        if (info[3].c) option.addClass(info[3].c);
        return option;
    }

    static createDictionarySelectOption(dict, info, langInfo) {
        const span = $('<span/>').addClass('UT').text(info[1]).attr('lang', info[0]);
        const img = langInfo[3].f ? $('<img/>').attr('src', `./static/images/${langInfo[3].f}`) : '';
        const option = $('<div/>').addClass('check option').append(span, img).attr('value', dict);
        return option;
    }

    static showDialog(dialogId, elemToAppend = '', elemToHighlight = '') {
        const dialog = $('#' + dialogId);
        dialogPolyfill.registerDialog(dialog[0]);
        if (elemToAppend) dialog.empty().append(elemToAppend);
        if (elemToHighlight) {
            elemToHighlight.addClass('highlighted');
            dialog.on('close', e => elemToHighlight.removeClass('highlighted'));
        }
        // Now dialog acts like a native <dialog>.
        dialog[0].showModal();
        return dialog;
    }

    static toggleFullScreen(enter) {
        var doc = window.document;
        var docEl = doc.documentElement;
      
        var requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
        var cancelFullScreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      
        if (enter && !doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
          requestFullScreen.call(docEl);
        } else if (!enter) {
          cancelFullScreen.call(doc);
        }
    }
}

export class JDialog {
    constructor(root, hlElem, customCss = {}) {
        this.root = root;
        this.hlElem = hlElem;
        this.customCss = customCss;
        this.isOpen = false;
        //this.dlgId = Math.ceil(Math.random() * 1e7);
    }
    show(showElem, stayInElem = $('body')) {
        this.root.css('position', 'relative');
        this.dlgDiv = $('<div/>').addClass('jdialog').append(showElem).appendTo(this.root)
            .css('width', Math.min(stayInElem.width(), showElem.outerWidth())).css(this.customCss)
            .click(e => e.stopPropagation()); // prevent clicks on the child from propagating up
        
        const dlgRight = this.dlgDiv.offset().left + this.dlgDiv.width();
        if (dlgRight > (stayInElem.offset().left + stayInElem.width())) {
            const newRight = stayInElem.offset().left + stayInElem.width() - (this.root.offset().left + this.root.width());
            this.dlgDiv.css('left', 'auto').css('right', -newRight);
        }
        if (this.hlElem) this.hlElem.addClass('highlighted');
        this.isOpen = true;
        return this;
    }
    close() {
        if (this.dlgDiv) this.dlgDiv.remove();
        if (this.hlElem) this.hlElem.removeClass('highlighted');
        this.isOpen = false;
    }
}

/** Register to show a dialog after some delay */
const hoverDialogRegistry = new Map();
export class JHoverDialog {
    static create(dlgName, hoverDelay, pElem, getContentFunc, customCss) {
        JHoverDialog.destroy(dlgName); // clear any old timeouts 
        const jdlg = new JDialog(pElem, pElem, customCss);
        const timer = setTimeout(() => jdlg.show(getContentFunc()), hoverDelay);
        hoverDialogRegistry.set(dlgName, { jdlg, timer });
    }
    static destroy(dlgName) {
        if (hoverDialogRegistry.has(dlgName)) {
            const dlgInfo = hoverDialogRegistry.get(dlgName);
            clearTimeout(dlgInfo.timer);
            if (dlgInfo.jdlg) dlgInfo.jdlg.close();
        }
    }
}

const vmTopPaneInfo = new Map([
    ['text', ['#text-view-area', '#text-view-button']],
    ['settings', ['#settings-area', '#settings-button']],
    ['title-search', ['#title-search-area', '#search-type-button']],
    ['fts', ['#fts-area', '#search-type-button']],
    ['dict', ['#dict-area', '#search-type-button']],
    ['bookmarks', ['#bookmarks-area', '']],
    ['help', ['#help-area', '']],
]);
class ViewManager {
    constructor() {
        this.curPane = this.prevPane = '';
        this.registerEvents();
        this.showPane('settings');
        vmTopPaneInfo.forEach(info => $(info[1]).addClass('top-pane-status'));
    }
    showPane(pane) {
        if (pane == 'back') pane = this.prevPane;
        $('div.top-pane').hide();
        $('.top-pane-status').removeClass('selected');
        const info = vmTopPaneInfo.get(pane);
        $(info[0]).show();
        if (info[1]) $(info[1]).addClass('selected');
        this.prevPane = this.curPane;
        this.curPane = pane;
        this.hideOverlappingContainers();
    }
    // gets the root element for the given pane
    getPaneRoot(pane) {
        return vmTopPaneInfo.get(pane)[0];
    }
    registerEvents() {
        $('#settings-button').click(e => this.showPane('settings'));
        $('#text-view-button').click(e => this.showPane('text'));

        $('#menu-toggle').mousedown(function (e) {
            $('#menu-list').animate({height: 'toggle'}, 200);
            e.stopPropagation();
        });
        $('#tree-toggle').mousedown(function(e) {
            $('.pitaka-tree-container').animate({width: 'toggle'}, 250);
            $('.pitaka-tree-container').toggleClass('user-opened');
            e.stopPropagation();
        });
        $('#menu-list, .pitaka-tree-container').mousedown(function(e) {
            e.stopPropagation();
        });
        $('body').mousedown(e => this.hideOverlappingContainers());
        $('dialog').click(e => { // clicking on the dialog (or backdrop) closes the dialog
            if ($(e.target).is('dialog')) {
                e.target.close('cancelled');
            }
        });
        $('.help-button').click(e => this.loadHelp(e));
        $('#help-menu-item,#about-menu-item,#offline-software-menu-item').click(e => {
            this.loadHelp(e);
            this.hideOverlappingContainers();
        });
    }
    hideOverlappingContainers() { // hide tree and menulist
        $('#menu-list').animate({height: 'hide'}, 250);
        if ($('.pitaka-tree-container').css('position') == 'absolute') { // hide the tree if it is overlapping
            $('.pitaka-tree-container').animate({width: 'hide'}, 250);
        }
    }
    async loadHelp(e = null) {
        // load help page to pane and then show the pane
        const areaDiv = $('#help-area');
        if (!areaDiv.children().length) { // only if not loaded already
            const html = await $.get(`./static/help-${areaDiv.attr('lang')}.html`);
            areaDiv.html(html);
            $('i', areaDiv).each((_i, icon) => $(icon).addClass('fa-fw'));
        }
        this.showPane('help');
        if (e) {
            const section = $(e.currentTarget).attr('sec');
            const sectionDiv = $(`[sec=${section}]`, areaDiv);
            areaDiv.scrollTop(areaDiv.scrollTop() + sectionDiv.position().top);
        }
    }
}

export const vManager = new ViewManager();