import { createRouter, createWebHashHistory, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { SCRIPT_CODES, LEGACY_SCRIPT } from '@shared/scripts'
import { isNativeApp, useApi } from './data/api'
import { useSettings } from './stores/settings'
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
  { path: `/:script${S}/:key(${KEY_RE})`, name: 'read', component: Reader },
  { path: `/:key(${KEY_RE})`, name: 'bare', redirect: to => `/${useSettings().script}/${to.params.key}` },
  { path: '/:pathMatch(.*)*', name: 'notfound', component: () => import('./views/NotFound.vue') },
]

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
  router.beforeEach(async to => {
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
    // remember the script of the url
    const s = to.params.script as string | undefined
    if (s) useSettings().script = s
  })
  return router
}
