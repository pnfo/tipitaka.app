/**
 * Created by janaka on 2018/08/02.
 */
import { PT, PT_REFRESH } from './settings.js';

const treeJsonFileURL = './static/json/full-tree.json';

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
            console.error("getJSON failed, status: " + textStatus + ", error: " + error);
        });
    }
    /*getFilesForParent() {
        $('#tree-e').children().each((_1, li) => {
            const ids = [];
            $(li).find('li[file-id]').each( (_2, li) => ids.push($(li).attr('file-id')) );
            console.log(ids);
        });
    }*/

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
    }

    registerClick() {
        this.root.on('click', 'li > a', e => { // delegate to new ajax elements(li > a) as well
            var li = $(e.currentTarget).parent();
            if (li.hasClass('parent')) {
                this.toggleBranch(li);
            } else if (li.attr('file-id')) {
                const fileId = li.attr('file-id');
                const coll = this.getCollection(fileId);
                const newT = PitakaTree.filterCollection(coll, fileId);
                this.appTabs.newTab(fileId, newT[1], coll);
            }
        });
    }
    getCollection(fileId) {
        return this.collections[this.fileIdToColl[fileId]];
    }
    // filter Collection by nameAttr or fileId - can be a static func
    static filterCollection(coll, val) { 
        return coll.n.filter(v => v[0] == val || v[2] == val)[0];
    }
    toggleBranch(li) {
        li.toggleClass('active').children('ul').slideToggle('fast');
    }
    showBranch(li) {
        li.addClass('active').children('ul').slideDown('fast');
    }
    collapse() {
        $('li.parent.active', this.root).removeClass('active').children('ul').slideUp('fast');
    }
    openBranch(fileId) {
        this.collapse(); // collapse all other branches first
        const fileLi = $(`li[file-id=${fileId}]`, this.root);
        fileLi.parents('li').each((_1, li) => this.showBranch($(li)));
        //this.showBranch(bookLi);
    }
}

export {PitakaTree};