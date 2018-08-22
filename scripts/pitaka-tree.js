/**
 * Created by janaka on 2018/08/02.
 */
import { PT, PT_REFRESH } from './file-display.js';
import { appSettings } from './settings.js';

const treeJsonFileURL = '../static/json/full-tree.json';

class PitakaTree {
    constructor(elem) {
        this.root = elem;
        this.treeJson = {};
        this.collections = [];
        this.fileIdToColl = {};
    }
    initialize(tabs) {
        this.appTabs = tabs;
        return $.getJSON(treeJsonFileURL, data => {
            this.treeJson = data;
            this.createCollections(this.treeJson, -1);
            this.root.append(this.createSubtree(this.treeJson, ['m'], 'tree-mul'));
            this.root.append(this.createSubtree(this.treeJson, ['a'], 'tree-att'));
            this.root.append(this.createSubtree(this.treeJson, ['t', 'ta'], 'tree-tik'));
            this.root.append(this.createSubtree(this.treeJson[3].c, ['e'], 'tree-e'));
            this.registerClick();
            console.log(`Tree loaded. num collections: ${this.collections.length}, num fileIds: ${Object.keys(this.fileIdToColl).length}`);
            //$(this).children('ul').children('li:nth-child(2)').children('a').click(); // expand sutta nikaya by default
        }).fail(function(d, textStatus, error) {
            console.error("getJSON failed, status: " + textStatus + ", error: "+error);
        });
    }

    createSubtree(jsonRoot, nameAttrs, idAttr, leafAttr) {
        const ul = $('<ul/>').attr('id', idAttr);
        jsonRoot.forEach(child => {
            if (child.c) { //parent
                for (let nameAttr of nameAttrs) {
                    if (child[nameAttr]) {
                        const label = $('<a/>').append(PT(child[nameAttr]));
                        const li = $('<li/>').append(label);
                        li.addClass('parent').append(this.createSubtree(child.c, nameAttrs, '', nameAttr)).appendTo(ul);
                    }
                }
            } else if (child[`f${leafAttr}`]) { // leaf
                const label = $('<a/>').append(PT(child[leafAttr]));
                const fileId = child[`f${leafAttr}`];
                $('<li/>').append(label).attr('file-id', fileId).appendTo(ul);
            }
        });
        return ul;
    }

    addCollection(node, parentCollId) {
        const collId = this.collections.length;
        const coll = { id: collId, p: parentCollId, n: [] }; 
        Object.keys(node).forEach(nameAttr => { // copy over name attrs
            if (nameAttr != 'c' && !nameAttr.startsWith('f')) {
                const fileId = node[`f${nameAttr}`];
                if (fileId) { // leaf
                    coll.n.push([ nameAttr, node[nameAttr], fileId ]);
                    this.fileIdToColl[ fileId ] = collId;
                } else { // parent
                    coll.n.push([ nameAttr, node[nameAttr] ]);
                }
            }
        });
        this.collections.push(coll);
        return collId;
    }
    createCollections(jsonRoot, parentCollId) {
        jsonRoot.forEach(child => {
            if (child.c) { // parent - create node and recurse
                this.createCollections(child.c, this.addCollection(child, parentCollId));
            } else { // leaf
                this.addCollection(child, parentCollId);
            }
        });
    }

    changeScript() {
        PT_REFRESH(this.root);
        //$('li > a', this.root).each((_1, a) => $(a).text(PT($(a).text())).attr('lang', appSettings.paliScript));
    }

    registerClick() {
        console.log('reg');
        this.root.on('click', 'li > a', e => { // delegate to new ajax elements(li > a) as well
            var li = $(e.currentTarget).parent();
            if (li.hasClass('parent')) {
                this.toggleBranch(li);
            } else if (li.attr('file-id')) {
                // TODO - not good to access si-text attr directly
                const title = li.find('.PT').attr('si-text');
                const fileId = li.attr('file-id');
                this.appTabs.newTab(fileId, title, this.collections[this.fileIdToColl[fileId]]);
                showPane('text');
            }
        });
    }

    toggleBranch(li) {
        li.toggleClass('active').children('ul').slideToggle('fast');
    }
    showBranch(li) {
        li.addClass('active').children('ul').slideDown('fast');
    }
    collapse() {
        $('li.parent', this.root).removeClass('active');
    }
    openBranch(fileId) {
        //this.collapse(); // collapse all other branches first
        var fileLi = $(`li[file-id=${fileId}]`, this.root);
        console.log(fileLi.length);
        fileLi.parents('li').each(p => this.showBranch($(p)));
        console.log(fileLi.parents('li'));
        //this.showBranch(bookLi);
    }
}

export {PitakaTree};