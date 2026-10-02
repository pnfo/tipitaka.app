/** localStorage helpers that never throw (private mode, quota, old WebViews) */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key)
    return s ? (JSON.parse(s) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota / disabled */ }
}

export function removeKey(key: string) {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}
