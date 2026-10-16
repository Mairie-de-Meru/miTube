import type { WorkerError } from './types'
import { YouTubeError, fetchInfo, IOS_UA, isAllowedStreamUrl, parseVideoId } from './youtube'

export interface Env {
  /** Origines autorisées, séparées par des virgules (ex. https://user.github.io). */
  ALLOWED_ORIGINS?: string
}

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

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })
}

export async function handle(req: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  const origin = req.headers.get('origin') ?? ''
  if (!allowedOrigins(env).includes(origin)) {
    return json({ error: 'FORBIDDEN_ORIGIN', reason: 'This origin is not allowed (see ALLOWED_ORIGINS).' } satisfies WorkerError, 403, {})
  }
  const h = cors(origin)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })
  if (req.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED' } satisfies WorkerError, 405, h)

  const url = new URL(req.url)
  if (url.pathname === '/info') {
    const id = parseVideoId(url.searchParams.get('v') ?? '')
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
    const headers: Record<string, string> = { 'user-agent': IOS_UA }
    const range = req.headers.get('range')
    if (range) headers.range = range
    const upstream = await fetcher(target, { headers })
    const out = new Headers(h)
    for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = upstream.headers.get(k)
      if (v) out.set(k, v)
    }
    out.set('cache-control', 'no-store')
    return new Response(upstream.body, { status: upstream.status, headers: out })
  }

  return json({ error: 'NOT_FOUND' } satisfies WorkerError, 404, h)
}

export default { fetch: (req: Request, env: Env) => handle(req, env) }
