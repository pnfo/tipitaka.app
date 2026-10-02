/**
 * Parser for the VRI CST TEI files (romn/*.xml, UTF-16LE with BOM). Produces a flat item stream:
 * div start/end events and paragraphs with stored markup (shared/markup.ts).
 *
 *   <div id n type>                 -> { k: 'div', id, type } ... { k: 'end' }
 *   <head rend>  /  <p rend n>       -> { k: 'p', rend, num, text, head }
 *   <trailer rend>                   -> { k: 'p', rend: 'trailer' }
 *   <hi rend="paranum">N</hi><hi rend="dot">.</hi>  -> num (always at the start of the paragraph)
 *   <hi rend="bold"> -> **..**   <note> -> {..}   <pb ed n/> -> |EDn|
 *   <p rend="hangnum"> only holds the number of the following verse: folded into the next paragraph
 */
import fs from 'node:fs'

export type XmlItem =
  | { k: 'div'; id: string; type: string }
  | { k: 'end' }
  | { k: 'p'; rend: string; num: string; text: string; head: boolean }

const TAG_RE = /<(\/?)([A-Za-z][\w.]*)((?:\s+[\w:]+="[^"]*")*)\s*(\/?)>|<\?[^>]*\?>|<!--[\s\S]*?-->|([^<]+)/g
const ATTR_RE = /([\w:]+)="([^"]*)"/g

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decodeEntities = (s: string) => s.replace(/&(\w+|#\d+|#x[0-9a-f]+);/gi, (m, e: string) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
  return ENTITIES[e] ?? m
})

export function readUtf16(file: string): string {
  const buf = fs.readFileSync(file)
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2))
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2))
  return buf.toString('utf8').replace(/^﻿/, '')
}

function attrs(s: string): Record<string, string> {
  const a: Record<string, string> = {}
  for (const m of s.matchAll(ATTR_RE)) a[m[1]] = m[2]
  return a
}

/** normalise whitespace inside stored markup: collapse runs, no spaces just inside ** or {} */
export function cleanText(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\{ +/g, '{').replace(/ +\}/g, '}')
    .replace(/\*\*\s*\*\*/g, '') // empty bold
    .replace(/\{\}/g, '')
    .trim()
}

export interface ParseWarning { file: string; msg: string }

export function parseXml(xml: string, file = '', warnings: ParseWarning[] = []): XmlItem[] {
  const items: XmlItem[] = []
  let para: { rend: string; head: boolean; num: string; buf: string[]; afterNum: boolean } | null = null
  const hiStack: string[] = [] // rend of open <hi>
  let inParanum = false
  let paranumBuf = ''
  let inBody = false
  let pendingHangnum = ''
  let pendingPb = '' // page breaks between paragraphs belong to the start of the next one

  const closePara = () => {
    if (!para) return
    let text = cleanText(para.buf.join(''))
    let num = para.num
    const pbs = text.match(/\|[MVPT][\d.]+\|/g)?.join('') ?? ''
    if (para.rend === 'hangnum' && !text.replace(/\|[MVPT][\d.]+\|/g, '').replace(/[.\s]/g, '')) {
      if (num) pendingHangnum = num
      pendingPb += pbs // page breaks inside the number paragraph go to the verse
      para = null
      return
    }
    // a hangnum holding text (verse numbering like "Ka.") is kept as an unindented paragraph
    if (pendingHangnum) {
      if (!num) num = pendingHangnum
      pendingHangnum = ''
    }
    // a lone dot left from <hi rend="dot"> after the paranum
    text = text.replace(/^\.\s*/, num ? '' : '.')
    if (text || num) items.push({ k: 'p', rend: para.rend, num, text, head: para.head })
    para = null
  }

  for (const m of xml.matchAll(TAG_RE)) {
    const [, close, name, attrStr, selfClose, textNode] = m
    if (textNode !== undefined) {
      if (!para) {
        if (inBody && textNode.trim()) warnings.push({ file, msg: `text outside paragraph: ${textNode.trim().slice(0, 60)}` })
        continue
      }
      const t = decodeEntities(textNode)
      if (inParanum) paranumBuf += t
      else if (hiStack[hiStack.length - 1] === 'dot' && para.afterNum) para.afterNum = false // drop the dot after the number
      else {
        para.buf.push(t)
        if (t.trim()) para.afterNum = false
      }
      continue
    }
    if (!name) continue // processing instruction / comment
    const a = attrStr ? attrs(attrStr) : {}
    if (name === 'body') { inBody = !close; continue }
    if (!inBody) continue
    if (name === 'div') {
      if (close) { closePara(); items.push({ k: 'end' }) } else { closePara(); items.push({ k: 'div', id: a.id ?? '', type: a.type ?? '' }) }
      continue
    }
    if (name === 'p' || name === 'head' || name === 'trailer') {
      if (close) { closePara(); continue }
      closePara()
      const rend = name === 'trailer' ? 'trailer' : (a.rend ?? 'bodytext')
      para = { rend, head: name === 'head', num: '', buf: pendingPb ? [pendingPb] : [], afterNum: false }
      pendingPb = ''
      if (selfClose) closePara()
      continue
    }
    if (!para) {
      if (name === 'pb' && a.ed && a.n) pendingPb += `|${a.ed}${a.n}|`
      else warnings.push({ file, msg: `<${close}${name}> outside paragraph` })
      continue
    }
    switch (name) {
      case 'hi': {
        if (selfClose) break
        if (close) {
          const rend = hiStack.pop()
          if (rend === 'paranum') {
            inParanum = false
            const n = paranumBuf.trim()
            if (para.num || para.buf.join('').trim()) warnings.push({ file, msg: `paranum ${n} not at the start of the paragraph` })
            if (!para.num) para.num = n
            para.afterNum = true
          } else if (rend === 'bold') para.buf.push('**')
        } else {
          const rend = a.rend ?? ''
          hiStack.push(rend)
          if (rend === 'paranum') { inParanum = true; paranumBuf = '' }
          else if (rend === 'bold') para.buf.push('**')
          else if (rend !== 'dot') warnings.push({ file, msg: `unknown hi rend ${rend}` })
        }
        break
      }
      case 'note':
        if (!selfClose) para.buf.push(close ? '}' : '{')
        break
      case 'pb':
        if (a.ed && a.n) para.buf.push(`|${a.ed}${a.n}|`)
        break
      default:
        warnings.push({ file, msg: `unknown tag ${name}` })
    }
  }
  closePara()
  return items
}

export function parseFile(path: string, warnings: ParseWarning[] = []): XmlItem[] {
  return parseXml(readUtf16(path), path.split('/').pop(), warnings)
}
