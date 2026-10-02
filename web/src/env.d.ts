/// <reference types="vite/client" />
/// <reference types="unplugin-icons/types/vue" />

declare const __IS_APP__: boolean
declare const __BUILD_INFO__: { content_hash: string; db_version: number }

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

/**
 * Native bridge of the Android / iOS apps (dev-docs/native-bridge.md):
 *  Android: window.TipitakaNative.query(id, request)   (@JavascriptInterface)
 *  iOS:     window.webkit.messageHandlers.tipitaka.postMessage({ id, request })
 * The app answers with window.__tipitakaResolve(id, response) on the UI thread.
 */
interface TipitakaNativeBridge {
  query(id: string, request: string): void
  setStatusBarColor?(hex: string): void
  share?(text: string): void
}
interface Window {
  TipitakaNative?: TipitakaNativeBridge
  webkit?: { messageHandlers?: { tipitaka?: { postMessage(m: { id: string; request: string }): void } } }
  __tipitakaResolve?: (id: string, response: string) => void
}
