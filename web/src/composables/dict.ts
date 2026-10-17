/** dictionary meanings: the canonical markup of build/dicts/markup.ts, sanitised for v-html */
import DOMPurify from 'dompurify'
import { t } from '@/i18n'

const TAGS = ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'hr', 'span', 'small', 'sup', 'sub', 'ul', 'ol', 'li', 'blockquote',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'a', 'abbr']
const ATTRS = ['class', 'data-dict', 'data-hom', 'data-ref', 'data-a', 'data-orig']

/** links carry no href: DictView handles data-dict / data-ref clicks */
export const cleanMeaning = (html: string) => DOMPurify.sanitize(html, { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATTRS, ALLOW_DATA_ATTR: false })

/** converts the text of html (not its tags) to the Pāḷi script */
export const convHtml = (html: string, conv: (s: string) => string) => html.replace(/(<[^>]*>)|([^<]+)/g, (_, tag: string, txt: string) => tag ?? conv(txt))

/** the entry a followed cross reference points to (kept here: the dictionary page is a new component after navigating) */
export const followed: { focus: { dict: string; word: string; hom: number } | null } = { focus: null }

/** the name of a dictionary language (Dict.lang) */
export const langName = (code: string) => ({ en: t('English'), my: t('Myanmar'), si: t('Sinhala'), th: t('Thai'), ch: t('Chinese'), hi: t('Hindi'),
  in: t('Indonesian'), es: t('Spanish'), pt: t('Portuguese'), kh: t('Khmer'), vi: t('Vietnamese'), ko: t('Korean') } as Record<string, string>)[code] ?? code
