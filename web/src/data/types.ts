/** API types - mirror server/engine (Go structs, json tags). */

export type Coll = 'mula' | 'atta' | 'tika' | 'anya'
export type NodeKind = 'group' | 'book' | 'div' | 'heading'

export interface TNode {
  key: string
  book: number
  kind: NodeKind
  coll: Coll
  rend?: string
  title: string
  start: number
  end: number
  depth: number
  children: number
  prev?: string
  next?: string
  mirror?: string
}

export interface NodeInfo extends TNode {
  path: TNode[]
  commentary: TNode[]
  mirrorNode?: TNode
  bookTitle?: string
  paraCount: number
}

export interface Book { id: number; name: string; coll: Coll; title: string; root: string; paraCount: number }

export interface Para { i: number; k: string; r: string; n?: string; t: string }

export interface TextChunk { book: Book; from: number; to: number; paras: Para[]; nodes: TNode[] }

export type LinkKind = 'mula-atta' | 'atta-tika' | 'mula-tika'
export interface Link { i: number; b: number; t: number; k: string; kind: LinkKind; src: string; fwd: boolean }

/**
 * Word level alignment (server/engine Gloss): a commentary lemma and the words it quotes. Spans are
 * [paragraph:offset, paragraph:offset) into the paragraph markup. side 't': the requested text has the quoted
 * words, [t:ts, tei:te) is the lemma in the commentary; side 'c': the requested text has the lemma, [t..te) are the
 * quoted words. The explanation in the commentary runs from the lemma to [xi:x).
 */
export interface Gloss {
  g: number; side: 't' | 'c'
  i: number; s: number; ei: number; e: number
  b: number; t: number; ts: number; tei: number; te: number
  xi: number; x: number
  k: string; kind: LinkKind; src: string; conf: number
}

export interface TitleHit extends TNode { parent: string; bookTitle: string }

export interface Combo { id: number; words: string[]; freq: number; books: number }
export interface FtsHit { combo: number; book: number; para: number; key: string; title: string; path: string; offs: number[]; text: string }
export interface FtsGroup { key: string; title: string; path: string; coll: Coll; count: number; para: number }
export interface FtsResult { combos: Combo[]; total: number; page: number; pageSize: number; hits: FtsHit[]; groups: FtsGroup[]; groupsTruncated?: boolean; truncated: boolean; tokens: number[] }

export interface Dict { code: string; lang: string; name: string; short: string; desc?: string; origin?: string; entries: number; optIn?: boolean; abbrevs?: Record<string, string> }
export interface DictEntry { dict: string; word: string; hom?: number; meaning: string; dist: number }
export interface DpdRoot { root: string; meaning: string; group: number; sign: string; sanskritRoot?: string; sanskritMeaning?: string }
export interface DpdHead {
  id: number; lemma: string; pos: string; grammar: string; meaning: string; meaningLit?: string; meaning2?: string
  construction?: string; rootKey?: string; rootBase?: string; derivedFrom?: string; sanskrit?: string; plusCase?: string
  compoundType?: string; compoundConstruction?: string; notes?: string; stem?: string; pattern?: string
  example?: string; source?: string; sutta?: string; ebtCount: number; root?: DpdRoot
}
export interface Breakup { word: string; type: string; origin: string; parts: [string, number][] }
export interface DictResult {
  word: string; entries: DictEntry[]; dpd: DpdHead[]; breakups: Breakup[]
  grammar?: [string, string, string][]; deconstructor?: string[]; spelling?: string; see?: string; abbrev?: string
}

export interface Meta { contentHash: string; dbVersion: string; upstream: string; builtAt: string; dpdVersion?: string; dpdCitation?: string; hasDict: boolean }
export interface LegacyTarget { key: string; para: number }

/** proper names (server/engine/names.go, dev-docs/names.md) */
export type EntityType = 'person' | 'deity' | 'group' | 'place' | 'animal'
export type SettingRole = 'place' | 'teacher' | 'with' | 'about'
export interface Entity {
  slug: string; type: EntityType; name: string; lemma: string; family?: string; meaning?: string
  /** places: coordinates; prec 1 located, 2 probable, 3 approximate, 4 in or near the place its meaning names */
  lat?: number; lon?: number; prec?: number
  /** suttas / stories with a setting of the name */
  units: number
  /** words of the mūla and aṭṭhakathā that name it */
  mentions: number
}
export interface SettingRef { role: SettingRole; ord: number; key: string; para: number; title: string; book: string; group: string; coll: Coll; src: string; conf: number }
export interface MentionBook { book: number; title: string; group: string; coll: Coll; sure: number; maybe: number }
export interface EntityInfo extends Entity {
  settings: SettingRef[]; related: (Entity & { role: SettingRole; count: number })[]; homonyms: Entity[]
  /** names often mentioned in the same paragraphs */
  comentions: (Entity & { count: number })[]
  books: MentionBook[]
}
/** a mention with the stored markup around it */
export interface MentionRef { key: string; para: number; pre: string; word: string; post: string; slug: string }
/** a mention in a paragraph: offsets into its markup, amb = namesakes it was not told apart from */
export interface ParaName extends Entity { i: number; s: number; e: number; amb: number }
export interface SettingRow extends Entity { role: SettingRole; ord: number; src: string; conf: number; evKey: string; evPara: number }
export interface UnitSetting { key: string; title: string; para: number; end: number; rows: SettingRow[] }
