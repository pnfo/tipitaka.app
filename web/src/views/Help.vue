<!-- /:script/help: the user guide of the interface language (web/src/help/<lang>.md, compiled by web/help.ts) -->
<template>
  <div class="mx-auto max-w-3xl px-4 pb-20 pt-6 text-[0.9375rem] leading-relaxed" data-testid="help">
    <PageTitle :title="t('Help')" class="mb-4" />
    <p v-if="notice" class="card mb-4 text-sm text-muted" data-testid="help-notice">
      {{ notice }}
      <button v-if="page !== english && !useEnglish" class="text-link underline" @click="useEnglish = true">{{ t('Read in English') }}</button>
    </p>
    <nav v-if="page" class="mb-6 flex flex-wrap gap-2" :aria-label="t('Contents')">
      <a v-for="s in page.toc" :key="s.id" :href="`#${s.id}`" class="chip hover:border-primary" @click.prevent="goTo(s.id)">{{ s.title }}</a>
    </nav>
    <!-- eslint-disable-next-line vue/no-v-html -- our own Markdown, compiled at build time -->
    <article v-if="page" ref="article" class="help" v-html="page.html" @click="onClick" />
  </div>
</template>

<script setup lang="ts">
import PageTitle from '@/components/PageTitle.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useScript } from '@/composables/script'
import { t, uiLang } from '@/i18n'
import type { HelpPage } from '../../help'

const loaders = import.meta.glob<{ default: HelpPage }>('../help/*.md')
const route = useRoute(), router = useRouter()
const { script } = useScript()
useHead({ title: computed(() => t('Help')) })

const english = ref<HelpPage | null>(null)
const translated = ref<HelpPage | null>(null)
const useEnglish = ref(false)
const article = ref<HTMLElement | null>(null)

watch(uiLang, async lang => {
  useEnglish.value = false
  english.value ??= (await loaders['../help/en.md']()).default
  const load = lang !== 'en' ? loaders[`../help/${lang}.md`] : undefined
  translated.value = load ? (await load()).default : null
}, { immediate: true })

const page = computed(() => (useEnglish.value ? null : translated.value) ?? english.value)
const notice = computed(() => {
  if (uiLang.value === 'en' || !english.value) return ''
  if (!translated.value) return t('The help is not yet translated into this language.')
  if (translated.value.version < english.value.version) return t('This translation is older than the English help.')
  return ''
})

function goTo(id: string, smooth = true) {
  const el = article.value?.querySelector(`[id="${id}"]`)
  if (!el) return
  el.scrollIntoView(smooth ? { behavior: 'smooth' } : undefined)
  if (route.hash !== `#${id}`) router.replace({ hash: `#${id}` })
}
// the section of the url (the ? links of the app) once the page is there
watch([page, () => route.hash], async () => {
  await nextTick()
  if (route.hash) goTo(route.hash.slice(1), false)
}, { immediate: true })

/** links of the guide: /<page> is a page of the app in the current script, #<id> a section */
function onClick(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest('a')
  const href = a?.getAttribute('href')
  if (!href || /^[a-z]+:/i.test(href)) return
  e.preventDefault()
  if (href.startsWith('#')) goTo(href.slice(1))
  else router.push(`/${script.value}${href === '/' ? '' : href}`)
}
</script>

<style>
.help h2 { margin: 2.25rem 0 0.75rem; font-size: 1.25rem; font-weight: 600; color: var(--c-primary); scroll-margin-top: 4.5rem; }
.help h2:first-child { margin-top: 0; }
.help h3 { margin: 1.5rem 0 0.5rem; font-weight: 600; scroll-margin-top: 4.5rem; }
.help p, .help ul, .help ol, .help table { margin: 0.5rem 0; }
.help ul { list-style: disc; padding-left: 1.25rem; }
.help ol { list-style: decimal; padding-left: 1.25rem; }
.help li { margin: 0.25rem 0; }
.help a { color: var(--c-link); text-decoration: underline; }
.help strong { font-weight: 600; }
.help code { border-radius: 0.25rem; background: var(--c-surface2); padding: 0 0.25rem; }
.help table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.help th, .help td { border: 1px solid var(--c-line); padding: 0.375rem 0.5rem; text-align: left; vertical-align: top; }
.help th { background: var(--c-surface2); font-weight: 600; }
/* the icons of the buttons, as small keys */
.help .help-icon { display: inline-block; box-sizing: content-box; width: 1em; height: 1em; padding: 0.125em; margin: 0 0.1em; vertical-align: -0.3em;
  border: 1px solid var(--c-line); border-radius: 0.375em; background: var(--c-surface); }
</style>
