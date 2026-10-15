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

export interface Link { i: number; b: number; t: number; k: string; kind: 'mula-atta' | 'atta-tika'; src: string; fwd: boolean }

export interface TitleHit extends TNode { parent: string; bookTitle: string }

export interface Combo { id: number; words: string[]; freq: number; books: number }
export interface FtsHit { combo: number; book: number; para: number; key: string; title: string; path: string; offs: number[]; text: string }
export interface FtsGroup { key: string; title: string; path: string; coll: Coll; count: number; para: number }
export interface FtsResult { combos: Combo[]; total: number; page: number; pageSize: number; hits: FtsHit[]; groups: FtsGroup[]; groupsTruncated?: boolean; truncated: boolean; tokens: number[] }

export interface Dict { code: string; lang: string; name: string; short: string; desc?: string; origin?: string; entries: number }
export interface DictEntry { dict: string; word: string; meaning: string; dist: number }
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
