<!-- dictionary results: DPD analysis (lookup of an inflected form) or a typed word, other dictionaries, breakups -->
<template>
  <div class="text-sm" style="overflow-wrap: anywhere" data-testid="dict-view">
    <!-- (the dictionary search page shows its own introduction) -->
    <div v-if="!word && mode === 'lookup'" class="py-8 text-center text-muted">{{ t('Tap a word in the text to look it up.') }}</div>
    <div v-else-if="loading" class="space-y-2 py-2" aria-busy="true">
      <div v-for="i in 4" :key="i" class="h-4 animate-pulse rounded bg-surface2" />
    </div>
    <div v-else-if="err" class="py-6 text-center text-muted">{{ err }}</div>
    <template v-else-if="res">
      <div class="mb-3 flex items-baseline space-x-2">
        <button v-if="back.length" class="icon-btn -ml-1 self-center" :aria-label="t('Back')" data-testid="dict-back" @click="goBack"><IconBack class="h-4 w-4" /></button>
        <h2 class="pali text-xl font-semibold text-primary" data-testid="dict-word">{{ conv(res.word) }}</h2>
        <span v-if="script !== 'latn'" class="text-muted">{{ res.word }}</span>
        <span class="flex-1" />
        <RouterLink v-if="compact" :to="{ name: 'dict', params: { script, q: res.word } }" class="text-sm text-link underline">{{ t('More') }}</RouterLink>
        <DictFilter v-if="compact" compact />
      </div>

      <!-- DPD analysis of the form -->
      <div v-if="res.grammar?.length || res.deconstructor?.length" class="mb-3 rounded-lg bg-surface2 p-2.5">
        <div v-for="(g, i) in uniqueGrammar" :key="i" class="space-x-2">
          <span class="pali font-medium">{{ conv(g[0]) }}</span><span class="text-muted">{{ g[1] }}</span><span>{{ g[2] }}</span>
        </div>
        <div v-for="(d, i) in res.deconstructor ?? []" :key="'d' + i" class="pali">
          <IconSplit class="mr-1 inline h-3.5 w-3.5 text-muted" />{{ conv(d) }}
        </div>
      </div>

      <section v-if="res.dpd.length" class="mb-4">
        <div class="section-title flex items-center gap-2">DPD <span class="font-normal normal-case tracking-normal">· Digital Pāḷi Dictionary</span></div>
        <DpdHeadword v-for="h in shownDpd" :key="h.id" :h="h" :conv="conv" />
        <button v-if="res.dpd.length > shownDpd.length" class="text-sm text-link underline" @click="dpdAll = true">{{ t('Show {0} more', res.dpd.length - shownDpd.length) }}</button>
      </section>

      <section v-if="res.entries.length" class="mb-4">
        <div class="section-title">{{ t('Dictionaries') }}</div>
        <div v-for="(e, i) in res.entries" :key="i" class="border-b border-line py-2 last:border-0" :class="{ 'dict-focus': isFocus(e) }"
          :data-dict-code="e.dict" data-testid="dict-entry" @click="onMeaningClick">
          <div class="mb-0.5 space-x-2">
            <button type="button" class="chip hover:border-primary" :title="dictName(e.dict)" :aria-label="dictName(e.dict)" data-testid="dict-chip"
              @click.stop="showDict($event, e.dict)">{{ dictShort(e.dict) }}</button>
            <span class="pali font-medium">{{ conv(e.word) }}</span><sup v-if="e.hom" class="text-[0.625rem] text-muted">{{ e.hom }}</sup>
          </div>
          <div class="meaning-html" v-html="clean(e.meaning)" />
        </div>
      </section>

      <section v-if="res.breakups.length" class="mb-4">
        <div class="section-title">{{ t('Breakup') }}</div>
        <div v-for="o in breakupLines" :key="o" class="pali">{{ conv(o) }}</div>
      </section>

      <Floating :open="!!tip" :anchor="tip?.el ?? null" :max-width="320" @close="tip = null">
        <div class="text-sm" data-testid="dict-tip">
          <div v-if="tip?.title" class="font-medium">{{ tip.title }}</div>
          <div v-if="tip?.text" :class="{ 'text-muted': tip?.title }">{{ tip.text }}</div>
          <div v-if="tip?.sub" class="mt-1 text-xs text-muted">{{ tip.sub }}</div>
        </div>
      </Floating>

      <div v-if="!res.dpd.length && !res.entries.length && !res.breakups.length && !res.grammar?.length" class="py-4 text-center text-muted" data-testid="dict-empty">
        {{ t('No results') }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import IconSplit from '~icons/lucide/split'
import IconBack from '~icons/lucide/arrow-left'
import DpdHeadword from './DpdHeadword.vue'
import DictFilter from './DictFilter.vue'
import Floating from './Floating.vue'
import { ApiError, useApi } from '@/data/api'
import type { Dict, DictEntry, DictResult } from '@/data/types'
import { useScript } from '@/composables/script'
import { cleanMeaning, followed, langName } from '@/composables/dict'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { t } from '@/i18n'

const props = defineProps<{ word: string; mode: 'lookup' | 'dict'; compact?: boolean }>()
const api = useApi()
const settings = useSettings()
const ui = useUi()
const router = useRouter()
const { script, conv } = useScript()
const res = ref<DictResult | null>(null)
const loading = ref(false)
const err = ref('')
const dicts = ref<Dict[]>([])
const dpdAll = ref(false)

api.dicts().then(d => { dicts.value = d }).catch(() => {})
const dictShort = (code: string) => dicts.value.find(d => d.code === code)?.short ?? code
const dictName = (code: string) => { const d = dicts.value.find(x => x.code === code); return d ? `${d.name} (${langName(d.lang)})` : code }
const clean = cleanMeaning

// cross references (<a data-dict>): the panel follows them in place (with a back button), the dictionary page navigates
const back = ref<string[]>([])
const focus = ref<{ dict: string; word: string; hom: number } | null>(followed.focus?.word === props.word ? followed.focus : null)
let following = false
// the exact matches (headword or variant) of the dictionary of the reference, the homonym if given
const isFocus = (e: DictEntry) => !!focus.value && e.dict === focus.value.dict && (!focus.value.hom || e.hom === focus.value.hom) && e.dist === 0
function follow(word: string, dict: string, hom: number) {
  const w = word.toLowerCase()
  focus.value = followed.focus = { dict, word: w, hom }
  following = true
  if (props.compact) {
    back.value.push(props.word)
    ui.lookupWord = w
  } else router.push({ name: 'dict', params: { script: script.value, q: w } })
}
function goBack() {
  following = true
  focus.value = null
  ui.lookupWord = back.value.pop() ?? ''
}

// abbreviations (<abbr data-a>) and editorial marks: a popover, on tap as well as on hover (title)
const tip = ref<{ el: HTMLElement; title: string; text: string; sub?: string } | null>(null)
/** the abbreviation of a dictionary (PN, AB ...): its name, description, language and source */
function showDict(ev: MouseEvent, code: string) {
  const d = dicts.value.find(x => x.code === code)
  if (!d) return
  tip.value = { el: ev.currentTarget as HTMLElement, title: d.name, text: d.desc ?? '', sub: [langName(d.lang), d.origin].filter(Boolean).join(' · ') }
}
function onMeaningClick(ev: MouseEvent) {
  const el = ev.target as HTMLElement
  const entry = ev.currentTarget as HTMLElement
  const dict = entry.dataset.dictCode ?? ''
  const link = el.closest<HTMLElement>('a[data-dict]')
  if (link) {
    ev.preventDefault()
    follow(link.dataset.dict ?? link.textContent ?? '', dict, Number(link.dataset.hom ?? 0))
    return
  }
  const abbr = el.closest<HTMLElement>('abbr[data-a]')
  if (abbr) {
    const a = abbr.dataset.a ?? ''
    const x = dicts.value.find(d => d.code === dict)?.abbrevs?.[a]
    if (x) tip.value = { el: abbr, title: a, text: x }
    return
  }
  // text references (<a data-ref="<key>#<paragraph>">): open the text there
  const ref = el.closest<HTMLElement>('a[data-ref]')
  if (ref) {
    ev.preventDefault()
    const [key, para] = (ref.dataset.ref ?? '').split('#')
    if (key) router.push({ name: 'read', params: { script: script.value, key }, hash: para ? `#p${para}` : '' })
    return
  }
  // a passage translated by AI (the Pali-Thai PTS): its mark explains it
  const ai = el.closest<HTMLElement>('.ai-mark')
  if (ai) {
    tip.value = { el: ai, title: t('Translated by AI'), text: t('Added or corrected by AI (Claude) from the PTS dictionary (2025 edition).') }
    return
  }
  const ed = el.closest<HTMLElement>('.ed-add, .ed-mod, .ed-orig')
  if (ed) {
    const orig = ed.dataset.orig
    tip.value = ed.classList.contains('ed-add') ? { el: ed, title: t('Added or corrected by the editor'), text: '' }
      : ed.classList.contains('ed-orig') ? { el: ed, title: t('Spelling of the original edition'), text: '' }
        : { el: ed, title: t('Modernised by the editor'), text: orig ? t('Original: {0}', orig) : '' }
  }
}

// the splits of the word and of its spellings that fold the same, once each
const breakupLines = computed(() => [...new Set((res.value?.breakups ?? []).map(b => b.origin))])
const shownDpd = computed(() => (dpdAll.value || !props.compact ? res.value?.dpd ?? [] : (res.value?.dpd ?? []).slice(0, 6)))
const uniqueGrammar = computed(() => {
  const seen = new Set<string>()
  return (res.value?.grammar ?? []).filter(g => { const k = g.join('|'); if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 8)
})

let gen = 0
watch(() => [props.word, props.mode, settings.dicts.join(',')] as const, async ([w], old) => {
  dpdAll.value = false
  tip.value = null
  if (old && w !== old[0]) {
    // a new word tapped in the text (not a followed reference) starts a new history
    if (!following) { back.value = []; focus.value = null }
    if (followed.focus?.word === w) focus.value = followed.focus
    following = false
  }
  if (!w) { res.value = null; return }
  const my = ++gen
  loading.value = true
  err.value = ''
  try {
    const r = props.mode === 'lookup' ? await api.lookup(w, settings.dicts, 20) : await api.dict(w, settings.dicts, 100)
    if (my === gen) {
      res.value = r
      followed.focus = null
      if (focus.value) {
        await nextTick()
        document.querySelector('.dict-focus')?.scrollIntoView({ block: 'nearest' })
      }
    }
  } catch (e) {
    if (my === gen) err.value = e instanceof ApiError && e.code === 'no_dict' ? t('The dictionary is not installed.') : t('Dictionary lookup failed.')
  } finally {
    if (my === gen) loading.value = false
  }
}, { immediate: true })
</script>
