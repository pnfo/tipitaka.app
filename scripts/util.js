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
        setTimeout(function(){ toast.fadeOut(); }, 3000);
    }

    static getParameterByName(name, defVal) {
        name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
        var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
            results = regex.exec(location.search);
        return results === null ? defVal : decodeURIComponent(results[1].replace(/\+/g, " "));
    }

    static createLanguageSelectOption(lang, val, flagFolder = './static/images/') {
        const span = $('<span/>').addClass('UT').text(val[1]).attr('lang', lang);
        const img = val[3].f ? $('<img/>').attr('src', `${flagFolder}${val[3].f}`) : '';
        const option = $('<div/>').addClass('option').append(span, img).attr('value', lang);
        if (val[3].c) option.addClass(val[3].c);
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
}