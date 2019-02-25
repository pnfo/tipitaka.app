/**
 * syllables and sound processing logic
 */

"use strict";

const alPat = '(?:[ක-ෆ]\u0dca(?:[රයව][ා-ො]?)?)';
// basic - has the kaka issue - where the second ka is pronaunced differently
const s1Regex = new RegExp(`(?:[ක-ෆ]|[අආඉඊඋඌඑඔ])[ා-ො]?(${alPat}|ං)*`, 'g');
// capture successive consos without following vowels in the same match
//const s2Regex = new RegExp(`(?:[ක-ෆ]|[අආඉඊඋඌඑඔ])([ක-ෆ]+(?![ා-ො\u0DCA])|[ා-ො])?(${alPat}|ං)*`, 'g');
const startReg = new RegExp(`^${alPat}+ං?`);

function breakSyllables(word) {
    let match, syls = [];
    word = word.replace(/ඃ/g, '');
    const word2 = word.replace(startReg, (m) => {
        syls.push(m);
        return '';
    });
    while ((match = s1Regex.exec(word2)) !== null) { // get all the matches
        syls.push(match[0]);
    }
    return syls;
}

export {breakSyllables};