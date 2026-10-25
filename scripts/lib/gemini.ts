/**
 * Gemini API calls (generateContent with a JSON schema), the same interface as Claude.ask, cached by input in cacheDir.
 * The key: GEMINI_API_KEY (paid; billed per token, see `cost`).
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Usage } from './claude'

export interface GeminiOptions {
  system: string
  cacheDir: string
  model: string
  /** US$ per 1M tokens: input, output (thinking counts as output) */
  price?: [number, number]
}

export class Gemini {
  total: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, ms: 0 }
  calls = 0
  cached = 0
  constructor(readonly o: GeminiOptions) {}

  cacheFile(kind: string, prompt: string): string {
    const hash = crypto.createHash('sha1').update(`gemini\n${kind}\n${this.o.model}\n${this.o.system}\n${prompt}`).digest('hex')
    return path.join(this.o.cacheDir, `${hash}.json`)
  }

  async ask<T>(kind: string, prompt: string, schema: object): Promise<T | null> {
    const file = this.cacheFile(kind, prompt)
    if (fs.existsSync(file)) { this.cached++; return (JSON.parse(fs.readFileSync(file, 'utf8')) as { out: T }).out }
    const key = process.env.GEMINI_API_KEY
    if (!key) throw new Error('GEMINI_API_KEY is not set')
    for (let attempt = 0; attempt < 4; attempt++) {
      const t0 = Date.now()
      let err = ''
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.o.model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: this.o.system }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, maxOutputTokens: 32768 },
          }),
        })
        const r = await res.json() as {
          error?: { status: string; message: string }
          candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
        }
        if (r.error) throw new Error(`${r.error.status} ${r.error.message}`)
        const c = r.candidates?.[0]
        const text = (c?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? '').join('')
        if (!text) throw new Error(`no output (${c?.finishReason})`)
        const out = JSON.parse(text) as T
        const u = r.usageMetadata ?? {}
        const usage: Usage = { input: u.promptTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), cacheRead: 0, cacheWrite: 0, cost: 0, ms: Date.now() - t0 }
        const [pi, po] = this.o.price ?? [0, 0]
        usage.cost = (usage.input * pi + usage.output * po) / 1e6
        this.calls++
        const t = this.total
        Object.assign(t, { input: t.input + usage.input, output: t.output + usage.output, cost: t.cost + usage.cost, ms: t.ms + usage.ms })
        fs.mkdirSync(this.o.cacheDir, { recursive: true })
        fs.writeFileSync(file, JSON.stringify({ kind, model: this.o.model, at: new Date().toISOString(), usage, out }))
        return out
      } catch (e) { err = String(e) }
      const wait = /429|RESOURCE_EXHAUSTED|UNAVAILABLE|503|overload/i.test(err) ? 30_000 * (attempt + 1) : 5_000
      console.warn(`  ${kind} gemini call failed (${err.slice(0, 200)}), retry in ${wait / 1000}s`)
      await new Promise(r => setTimeout(r, wait))
    }
    return null
  }

  usageLine(): string {
    const t = this.total
    return `Gemini ${this.o.model}: ${this.calls} calls (${this.cached} cached), input ${t.input} tokens, output ${t.output} (incl. thinking), ` +
      `${(t.ms / 1000 / Math.max(1, this.calls)).toFixed(1)}s per call, cost $${t.cost.toFixed(2)}`
  }
}
