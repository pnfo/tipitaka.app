/**
 * Headless Claude Code calls on the user's plan: `claude -p --output-format json --json-schema … --tools ""`, the
 * answer is the `structured_output`. Every call is cached by its input (kind, prompt version, model, tools, prompt) in
 * cacheDir, so a run can be stopped and resumed. On the plan's session / usage limit a call waits for the reset.
 * The binary: CLAUDE_BIN, else claude on PATH, else the VS Code extension's binary.
 */
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function claudeBin(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN
  for (const dir of (process.env.PATH ?? '').split(':')) if (fs.existsSync(path.join(dir, 'claude'))) return path.join(dir, 'claude')
  const ext = path.join(os.homedir(), '.vscode/extensions')
  const found = fs.existsSync(ext) ? fs.readdirSync(ext).filter(d => d.startsWith('anthropic.claude-code-')).sort().reverse()
    .map(d => path.join(ext, d, 'resources/native-binary/claude')).find(f => fs.existsSync(f)) : undefined
  if (found) return found
  throw new Error('claude CLI not found: set CLAUDE_BIN')
}

export interface Usage { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; ms: number }
/** model (default: the client's), tools the model may use (Grep / Read over cwd) */
export interface AskOptions { model?: string; tools?: string[]; cwd?: string }

export interface ClaudeOptions {
  system: string
  cacheDir: string
  model: string
  /** print the prompts instead of calling */
  dry?: boolean
  /** per job kind: changing a prompt changes its version (and so its cache keys) */
  versions?: Record<string, number>
  /** on the plan's session / usage limit: throw LimitReached instead of waiting for the reset */
  stopOnLimit?: boolean
}

/** the plan's session / usage limit was reached (ClaudeOptions.stopOnLimit) */
export class LimitReached extends Error {}

export class Claude {
  total: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, ms: 0 }
  calls = 0
  cached = 0
  private limitSince = 0
  constructor(readonly o: ClaudeOptions) {}

  cacheFile(kind: string, prompt: string, o: AskOptions = {}): string {
    const model = o.model ?? this.o.model
    const hash = crypto.createHash('sha1').update(`${kind}\n${this.o.versions?.[kind] ?? 1}\n${model}\n${o.tools?.length ? `tools ${o.tools.join(',')}\n` : ''}${prompt}`).digest('hex')
    return path.join(this.o.cacheDir, `${hash}.json`)
  }

  async ask<T>(kind: string, prompt: string, schema: object, o: AskOptions = {}): Promise<T | null> {
    const model = o.model ?? this.o.model
    const file = this.cacheFile(kind, prompt, o)
    if (fs.existsSync(file)) { this.cached++; return (JSON.parse(fs.readFileSync(file, 'utf8')) as { out: T }).out }
    if (this.o.dry) { console.log(`--- ${kind} prompt (${prompt.length} chars) ---\n${prompt}\n`); return null }
    for (let attempt = 0; attempt < 4; attempt++) {
      const t0 = Date.now()
      const res = await this.run(prompt, schema, { ...o, model }).catch(e => ({ error: String(e) }))
      if ('out' in res && res.out) {
        this.calls++
        const u = res.usage, t = this.total
        Object.assign(t, { input: t.input + u.input, output: t.output + u.output, cacheRead: t.cacheRead + u.cacheRead, cacheWrite: t.cacheWrite + u.cacheWrite, cost: t.cost + u.cost, ms: t.ms + (Date.now() - t0) })
        fs.mkdirSync(this.o.cacheDir, { recursive: true })
        fs.writeFileSync(file, JSON.stringify({ kind, model, at: new Date().toISOString(), usage: u, out: res.out }))
        return res.out as T
      }
      const err = 'error' in res ? res.error : 'no output'
      // the plan's session / usage limit: wait for the reset (checking every 10 minutes) instead of giving up
      if (/session limit|usage limit|limit reached/i.test(err)) {
        if (this.o.stopOnLimit) throw new LimitReached(err.slice(0, 200))
        if (!this.limitSince) { this.limitSince = Date.now(); console.warn(`  usage limit reached (${err.slice(0, 120)}): waiting for the reset`) }
        await new Promise(r => setTimeout(r, 600_000))
        attempt--
        continue
      }
      this.limitSince = 0
      const wait = /rate|limit|overload|429|529/i.test(err) ? 60_000 * (attempt + 1) : 5_000
      console.warn(`  ${kind} call failed (${err.slice(0, 200)}), retry in ${wait / 1000}s`)
      await new Promise(r => setTimeout(r, wait))
    }
    return null
  }

  private run(prompt: string, schema: object, o: AskOptions & { model: string }): Promise<{ out: unknown; usage: Usage } | { error: string }> {
    return new Promise(resolve => {
      const tools = o.tools?.length ? ['--tools', o.tools.join(','), '--allowedTools', ...o.tools] : ['--tools', '']
      const p = spawn(claudeBin(), ['-p', '--model', o.model, '--output-format', 'json', ...tools, '--no-session-persistence',
        '--strict-mcp-config', '--system-prompt', this.o.system, '--json-schema', JSON.stringify(schema)], { cwd: o.cwd ?? os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] })
      let out = '', err = ''
      p.stdout.on('data', d => { out += d })
      p.stderr.on('data', d => { err += d })
      p.on('close', () => {
        try {
          const r = JSON.parse(out)
          if (r.is_error || !r.structured_output) return resolve({ error: `${r.api_error_status ?? ''} ${r.result ?? ''} ${err}`.trim() })
          const u = r.usage ?? {}
          resolve({ out: r.structured_output, usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cost: r.total_cost_usd ?? 0, ms: 0 } })
        } catch { resolve({ error: (err || out).slice(0, 500) }) }
      })
      p.stdin.end(prompt)
    })
  }

  usageLine(): string {
    const t = this.total
    return `Usage: ${this.calls} calls (${this.cached} cached), input ${t.input + t.cacheRead + t.cacheWrite} tokens (${t.cacheRead} cache reads), output ${t.output}, ` +
      `${(t.ms / 1000 / Math.max(1, this.calls)).toFixed(1)}s per call, API cost equivalent $${t.cost.toFixed(2)}`
  }
}

export async function pool<T, R>(items: T[], n: number, f: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0, done = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await f(items[i], i)
      if (++done % 10 === 0 || done === items.length) console.log(`  ${done}/${items.length}`)
    }
  }))
  return out
}
