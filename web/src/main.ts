import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createHead } from '@unhead/vue/client'
import App from './App.vue'
import { makeRouter } from './router'
import { isDesktopApp } from './data/api'
import './styles/main.css'
import './styles/fonts.css'

// small DOM polyfills for old WebViews (Android 7 ships WebView 53)
if (!Element.prototype.getAttributeNames) {
  Element.prototype.getAttributeNames = function (this: Element) { return Array.prototype.map.call(this.attributes, (a: Attr) => a.name) as string[] }
}

async function polyfills() {
  const tasks: Promise<unknown>[] = []
  if (!('IntersectionObserver' in window)) tasks.push(import('intersection-observer'))
  if (!('ResizeObserver' in window)) {
    tasks.push(import('@juggle/resize-observer').then(m => { (window as unknown as { ResizeObserver: unknown }).ResizeObserver = m.ResizeObserver }))
  }
  await Promise.all(tasks)
}

// desktop app: links to other sites open in the browser (the webview would navigate away or ignore target=_blank)
if (isDesktopApp()) {
  document.addEventListener('click', e => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!a) return
    const url = new URL(a.href, location.href)
    if (url.origin === location.origin || !/^(https?|mailto):$/.test(url.protocol)) return
    e.preventDefault()
    window.runtime!.BrowserOpenURL!(url.href)
  }, true)
}

polyfills().finally(() => {
  const app = createApp(App)
  app.use(createPinia())
  app.use(makeRouter())
  app.use(createHead())
  app.mount('#app')
})
