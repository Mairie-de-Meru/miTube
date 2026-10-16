import type { WorkerError } from './types'
import { YouTubeError, fetchInfo, IOS_UA, isAllowedStreamUrl, parseVideoId } from './youtube'

export interface Env {
  /** Origines autorisées, séparées par des virgules (ex. https://user.github.io). */
  ALLOWED_ORIGINS?: string
  /** Limiteur de débit Cloudflare par IP (facultatif, voir wrangler.toml). */
  LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> }
}

/** Taille maximale d'une tranche demandée à /stream (le front en demande 8 Mo). */
export const MAX_RANGE = 16 * 1024 * 1024
const MAX_REDIRECTS = 3

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:5173']

export function allowedOrigins(env: Env): string[] {
  const extra = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)
  return [...extra, ...DEFAULT_ORIGINS]
}

function cors(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'range',
    'access-control-expose-headers': 'content-length, content-range, accept-ranges, content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  }
}

const SAFE = { 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' }

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...SAFE, ...headers } })
}

/** Plage « bytes=a-b » bornée, ou null. */
export function parseRange(value: string | null): string | null {
  const m = /^bytes=(\d{1,12})-(\d{1,12})$/.exec(value ?? '')
  if (!m) return null
  const [a, b] = [Number(m[1]), Number(m[2])]
  return b >= a && b - a + 1 <= MAX_RANGE ? `bytes=${a}-${b}` : null
}

/** Suit les redirections à la main : chaque saut doit rester sur un serveur de médias YouTube. */
async function fetchMedia(target: string, headers: Record<string, string>, fetcher: typeof fetch): Promise<Response | null> {
  let url = target
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const res = await fetcher(url, { headers, redirect: 'manual' })
    if (res.status < 300 || res.status >= 400) return res
    const next = res.headers.get('location')
    if (!next) return null
    url = new URL(next, url).toString()
    if (!isAllowedStreamUrl(url)) return null
  }
  return null
}

export async function handle(req: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  const origin = req.headers.get('origin') ?? ''
  if (!allowedOrigins(env).includes(origin)) {
    return json({ error: 'FORBIDDEN_ORIGIN', reason: 'This origin is not allowed (see ALLOWED_ORIGINS).' } satisfies WorkerError, 403, {})
  }
  const h = cors(origin)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })
  if (req.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED' } satisfies WorkerError, 405, h)
  if (env.LIMITER) {
    const key = req.headers.get('cf-connecting-ip') ?? 'unknown'
    if (!(await env.LIMITER.limit({ key })).success) return json({ error: 'RATE_LIMITED', reason: 'Too many requests, retry in a minute.' } satisfies WorkerError, 429, h)
  }

  const url = new URL(req.url)
  if (url.pathname === '/info') {
    const id = parseVideoId((url.searchParams.get('v') ?? '').slice(0, 300))
    if (!id) return json({ error: 'INVALID_URL', reason: 'Not a YouTube video URL.' } satisfies WorkerError, 400, h)
    try {
      return json(await fetchInfo(id, fetcher), 200, h)
    } catch (e) {
      if (e instanceof YouTubeError) return json({ error: e.message, reason: e.reason } satisfies WorkerError, 422, h)
      return json({ error: 'UPSTREAM', reason: e instanceof Error ? e.message : String(e) } satisfies WorkerError, 502, h)
    }
  }

  if (url.pathname === '/stream') {
    const target = url.searchParams.get('u') ?? ''
    if (!isAllowedStreamUrl(target)) return json({ error: 'INVALID_STREAM_URL' } satisfies WorkerError, 400, h)
    const range = parseRange(req.headers.get('range'))
    if (!range) return json({ error: 'RANGE_REQUIRED', reason: `A Range of at most ${MAX_RANGE} bytes is required.` } satisfies WorkerError, 416, h)
    const upstream = await fetchMedia(target, { 'user-agent': IOS_UA, range }, fetcher)
    if (!upstream) return json({ error: 'UPSTREAM', reason: 'Unexpected redirect.' } satisfies WorkerError, 502, h)
    const out = new Headers(h)
    for (const k of ['content-length', 'content-range', 'accept-ranges']) {
      const v = upstream.headers.get(k)
      if (v) out.set(k, v)
    }
    const type = upstream.headers.get('content-type') ?? ''
    out.set('content-type', /^(audio|video)\/[\w.+-]+$/.test(type) ? type : 'application/octet-stream')
    for (const [k, v] of Object.entries(SAFE)) out.set(k, v)
    return new Response(upstream.body, { status: upstream.status, headers: out })
  }

  return json({ error: 'NOT_FOUND' } satisfies WorkerError, 404, h)
}

export default { fetch: (req: Request, env: Env) => handle(req, env) }
