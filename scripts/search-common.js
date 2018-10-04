"use strict";
import { PT } from "./settings.js";

// store the data in local browser cache - will be available even after browser restart
class TitleStorageHelper {
    constructor(name, url, version) {
        this.name = name;
        this.dataUrl = url;
        this.version = version;
        this.data = [];
        this.topParentsInfo = []; // todo move to subclass
        this.fileToTSI = new Map(); // file to title storage index (used by fts results display)
    }
    async init() {
        if (this.version != localStorage.getItem(`version_${this.name}`) || !this.getLocalData()) {
            await this.loadUrlData();
        }
        this.data.forEach(entry => {
            if (!this.fileToTSI.has(entry[TSE.file]) && entry[TSE.type] == 'cha') { // the first 'cha' entry with the file
                this.fileToTSI.set(entry[TSE.file], entry[TSE.id]);
            }
            if (!entry[TSE.parents].length) {
                this.topParentsInfo.push([entry[TSE.id], entry[TSE.name]]);
            }
        });
        console.log(`fileToTSI map created with ${this.fileToTSI.size} entries.`);
        console.log(`Top Parents Info created ${this.topParentsInfo}`);
    }

    getLocalData() {
        const dataStr = localStorage.getItem(this.name);
        if (!dataStr) {
            console.log(`no data in storage for ${this.name}`);
            return false;
        }
        this.data = JSON.parse(LZString.decompressFromUTF16(dataStr));
        console.log(`${this.name} loaded of length ${this.data.length} from local storage.`);
        return true;
    }
    
    // whatever the version given would be marked as the version of the loaded data
    async loadUrlData() {
        let data;
        try {
            data = await $.getJSON(this.dataUrl);    
        } catch(err) {
            throw new Error(`Failed to load the ${this.name}. Please check your internet connection`); // TODO add to string resources.
        }
        this.data = data;
        // compress and put in local storage
        const uncompressed = JSON.stringify(this.data);
        const compressed = LZString.compressToUTF16(uncompressed);
        try {
            localStorage.setItem(this.name, compressed);
            console.log(`Stored data of length ${compressed.length} to local storage. Uncompressed length ${uncompressed.length}`);
            localStorage.setItem(`version_${this.name}`, this.version);
        } catch(domException) {
            console.error(`Failed to set ${this.name} of size ${compressed.length} to local storage ${domException}`);
        }
    }
}

export class SearchFilter {
    constructor(root, topParentsInfo, defaultFilter, cbObj) {
        this.root = root;
        this.topParentsInfo = topParentsInfo;
        this.cbObj = cbObj;
        this.filter = new Map(); defaultFilter.forEach(id => this.filter.set(id, 1));
        this.render();
        this.registerClicks();
    }
    render() {
        this.table = $('<table/>').addClass('filter-table').appendTo(this.root);
        //console.log(this.topParentsInfo);
        [0, 1, 2].forEach(row => {
            const tr = $('<tr/>').attr('row', row).appendTo(this.table);
            [0, 1, 2].forEach(column => {
                const info = this.topParentsInfo[column * 3 + row];
                this.renderCheckBox(info[TSE.id], info[TSE.name], row, column).appendTo(tr);
            });
        });
        const anya = this.renderCheckBox(this.topParentsInfo[9][TSE.id], this.topParentsInfo[9][TSE.name], 3, 0).attr('colspan', 3);
        $('<tr/>').attr('row', 3).append(anya).appendTo(this.table);
    }
    renderCheckBox(id, label, row, column) {
        return $('<td/>').html(PT(label)).attr('row', row).attr('column', column).attr('value', id)
            .toggleClass('checked', this.filter.has(id));

    }
    registerClicks() {
        this.table.on('click', 'td', e => {
            const td = $(e.currentTarget).toggleClass('checked');
            if (td.hasClass('checked')) {
                this.filter.set(Number(td.attr('value')), 1);
            } else {
                this.filter.delete(Number(td.attr('value')));
            }
            this.cbObj.filterChanged(Array.from(this.filter.keys()));
        });
    }
}

// search index fields - copied from the title-search-index.js
export const TSE = Object.freeze({
    id: 0,
    name: 1,
    type: 2,
    parents: 3,
    file: 4,
    lineInd: 5,
});

const currentTitleIndexVer = '2.0';
export const TSH = new TitleStorageHelper('title-index', './static/json/title-search-index.json', currentTitleIndexVer);
