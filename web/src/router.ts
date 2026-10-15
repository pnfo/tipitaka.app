import { START_LOCATION, createRouter, createWebHashHistory, createWebHistory, type RouteRecordRaw, type Router } from 'vue-router'
import { SCRIPT_CODES, LEGACY_SCRIPT } from '@shared/scripts'
import { isNativeApp, useApi } from './data/api'
import { useSettings } from './stores/settings'
import { useUi } from './stores/ui'
import Home from './views/Home.vue'
import Reader from './views/Reader.vue'

// URL formats are a public contract (shared links, SEO) - see dev-docs/architecture.md
const S = `(${SCRIPT_CODES.join('|')})`
export const KEY_RE = '[a-z0-9-]+' // vue-router param regexes can not contain * (repeat modifier)

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'root', component: Home },
  { path: `/:script${S}`, name: 'home', component: Home },
  { path: `/:script${S}/search/:q?`, name: 'search', component: () => import('./views/Search.vue') },
  { path: `/:script${S}/titles/:q?`, name: 'titles', component: () => import('./views/Search.vue'), meta: { mode: 'titles' } },
  { path: `/:script${S}/dict/:q?`, name: 'dict', component: () => import('./views/Search.vue'), meta: { mode: 'dict' } },
  { path: `/:script${S}/bookmarks`, name: 'bookmarks', component: () => import('./views/Bookmarks.vue') },
  { path: `/:script${S}/settings`, name: 'settings', component: () => import('./views/Settings.vue') },
  { path: `/:script${S}/about`, name: 'about', component: () => import('./views/About.vue') },
  { path: `/:script${S}/convert`, name: 'convert', component: () => import('./views/Convert.vue') },
  { path: `/:script${S}/:key(${KEY_RE})`, name: 'read', component: Reader },
  { path: `/:key(${KEY_RE})`, name: 'bare', redirect: to => `/${useSettings().script}/${to.params.key}` },
  { path: '/:pathMatch(.*)*', name: 'notfound', component: () => import('./views/NotFound.vue') },
]

let pendingScript = ''
/** switch the Pāḷi script: the current page in the new script */
export function changeScript(router: Router, code: string) {
  const route = router.currentRoute.value
  pendingScript = code
  if (route.params.script && route.name) return router.replace({ name: route.name, params: { ...route.params, script: code }, query: route.query, hash: route.hash })
  return router.push({ name: 'home', params: { script: code } })
}

export function makeRouter() {
  const router = createRouter({
    history: isNativeApp() ? createWebHashHistory() : createWebHistory(import.meta.env.BASE_URL),
    routes,
    scrollBehavior(to, _from, saved) {
      if (saved) return saved
      if (to.name === 'read') return false // the reader scrolls itself (paragraph targets, lazy text)
      return { top: 0 }
    },
  })
  router.beforeEach(async (to, from) => {
    // v2 links ?a=<file>-<line>-<script> (the server redirects too; the apps need it here)
    const a = to.query.a
    if (typeof a === 'string' && a) {
      const [file, line, s] = a.split('-')
      try {
        const t = await useApi().legacy(file, +line || 0)
        return { name: 'read', params: { script: LEGACY_SCRIPT[s] ?? useSettings().script, key: t.key }, hash: `#p${t.para}`, replace: true }
      } catch { return { name: 'home', params: { script: useSettings().script }, replace: true } }
    }
    if (to.name === 'root') return { name: 'home', params: { script: useSettings().script }, replace: true }
    // The script of the url is the script of the app on the first page (shared links) and when the user picks
    // one (changeScript). Later navigations (back / forward, remembered pages) keep the current script.
    const s = to.params.script as string | undefined
    const settings = useSettings()
    if (s && s !== settings.script && from !== START_LOCATION && s !== pendingScript && to.name) {
      return { name: to.name, params: { ...to.params, script: settings.script }, query: to.query, hash: to.hash, replace: true }
    }
    pendingScript = ''
    if (s) settings.script = s
  })
  router.afterEach(to => { if (to.name !== 'settings') useUi().lastPage = to.fullPath })
  return router
}
