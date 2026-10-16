import { describe, expect, it } from 'vitest'
import { handle, MAX_RANGE, parseRange } from './index'
import { isAllowedStreamUrl, parsePlayerResponse, parseVideoId, YouTubeError } from './youtube'

const ORIGIN = 'https://user.github.io'
const env = { ALLOWED_ORIGINS: ORIGIN }
const req = (path: string, init: RequestInit & { origin?: string } = {}) =>
  new Request(`https://worker.test${path}`, { ...init, headers: { ...(init.origin === undefined ? { origin: ORIGIN } : init.origin ? { origin: init.origin } : {}), ...(init.headers as object) } })

describe('parseVideoId', () => {
  it.each([
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3', 'dQw4w9WgXcQ'],
    ['youtu.be/dQw4w9WgXcQ?si=x', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('%s', (input, id) => expect(parseVideoId(input)).toBe(id))
  it.each(['', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch', 'not a url', 'https://evil.com/youtu.be/dQw4w9WgXcQ'])('rejette %s', (input) =>
    expect(parseVideoId(input)).toBeNull(),
  )
})

describe('isAllowedStreamUrl', () => {
  it('accepte googlevideo en https', () => expect(isAllowedStreamUrl('https://rr1---sn-abc.googlevideo.com/videoplayback?x=1')).toBe(true))
  it('rejette un autre chemin que /videoplayback', () => expect(isAllowedStreamUrl('https://rr1.googlevideo.com/other')).toBe(false))
  it.each([
    'http://rr1.googlevideo.com/x',
    'https://googlevideo.com.evil.com/x',
    'https://evilgooglevideo.com/x',
    'https://user@rr1.googlevideo.com/x',
    'https://rr1.googlevideo.com:8443/x',
    'https://127.0.0.1/x',
    'javascript:alert(1)',
    '',
  ])('rejette %s', (u) => expect(isAllowedStreamUrl(u)).toBe(false))
})

const player = {
  playabilityStatus: { status: 'OK' },
  videoDetails: { title: 'T', author: 'A', lengthSeconds: '12', thumbnail: { thumbnails: [{ url: 'a' }, { url: 'b' }] } },
  streamingData: {
    formats: [{ itag: 18, url: 'u18', mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', height: 360, contentLength: '100' }],
    adaptiveFormats: [
      { itag: 137, url: 'u137', mimeType: 'video/mp4; codecs="avc1.640028"', height: 1080, fps: 30, bitrate: 5, contentLength: '999' },
      { itag: 140, url: 'u140', mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 129, contentLength: '50' },
      { itag: 140, url: 'dub', mimeType: 'audio/mp4; codecs="mp4a.40.2"', audioTrack: { audioIsDefault: false } },
      { itag: 1, mimeType: 'audio/mp4; codecs="mp4a.40.2"' },
    ],
  },
}

describe('parsePlayerResponse', () => {
  it('mappe les formats et ignore les pistes doublées / sans URL', () => {
    const info = parsePlayerResponse(player, 'id')
    expect(info.title).toBe('T')
    expect(info.thumbnail).toBe('b')
    expect(info.formats.map((f) => [f.itag, f.kind, f.ext, f.codec])).toEqual([
      [18, 'muxed', 'mp4', 'avc1.42001E'],
      [137, 'video', 'mp4', 'avc1.640028'],
      [140, 'audio', 'm4a', 'mp4a.40.2'],
    ])
  })
  it('lève une erreur si la vidéo n\'est pas lisible', () => {
    expect(() => parsePlayerResponse({ playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in' } }, 'id')).toThrow(YouTubeError)
  })
})

describe('handle', () => {
  const ok = (body: unknown, init?: ResponseInit) => (async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), init)) as typeof fetch

  it('refuse une origine inconnue ou absente', async () => {
    expect((await handle(req('/info?v=dQw4w9WgXcQ', { origin: 'https://evil.example' }), env, ok(player))).status).toBe(403)
    expect((await handle(req('/info?v=dQw4w9WgXcQ', { origin: '' }), env, ok(player))).status).toBe(403)
  })
  it('répond au préflight avec les en-têtes CORS', async () => {
    const res = await handle(req('/stream', { method: 'OPTIONS' }), env)
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(res.headers.get('access-control-allow-headers')).toBe('range')
  })
  it('/info renvoie les formats', async () => {
    const res = await handle(req('/info?v=dQw4w9WgXcQ'), env, ok(player))
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(((await res.json()) as { formats: unknown[] }).formats).toHaveLength(3)
  })
  it('/info refuse une URL qui n\'est pas YouTube', async () => {
    expect((await handle(req('/info?v=https://example.com/x'), env, ok(player))).status).toBe(400)
  })
  it('/info remonte le refus de YouTube', async () => {
    const res = await handle(req('/info?v=dQw4w9WgXcQ'), env, ok({ playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm' } }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'LOGIN_REQUIRED', reason: 'Sign in to confirm' })
  })
  it('/stream refuse un hôte hors googlevideo sans le contacter', async () => {
    let called = false
    const f = (async () => ((called = true), new Response('x'))) as typeof fetch
    const res = await handle(req(`/stream?u=${encodeURIComponent('https://example.com/a')}`), env, f)
    expect(res.status).toBe(400)
    expect(called).toBe(false)
  })
  it('/stream relaie la plage demandée et les en-têtes utiles', async () => {
    let seen: Headers | undefined
    const f = (async (_u: unknown, init?: RequestInit) => {
      seen = new Headers(init?.headers)
      return new Response('abc', { status: 206, headers: { 'content-range': 'bytes 0-2/10', 'content-type': 'audio/mp4', 'set-cookie': 'x=1' } })
    }) as typeof fetch
    const res = await handle(req(`/stream?u=${encodeURIComponent('https://rr1.googlevideo.com/videoplayback?a=1')}`, { headers: { range: 'bytes=0-2' } }), env, f)
    expect(res.status).toBe(206)
    expect(seen?.get('range')).toBe('bytes=0-2')
    expect(res.headers.get('content-range')).toBe('bytes 0-2/10')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(await res.text()).toBe('abc')
  })

  const media = `/stream?u=${encodeURIComponent('https://rr1.googlevideo.com/videoplayback?a=1')}`
  it('/stream exige une plage bornée', async () => {
    const f = ok('x')
    expect((await handle(req(media), env, f)).status).toBe(416)
    expect((await handle(req(media, { headers: { range: 'bytes=0-' } }), env, f)).status).toBe(416)
    expect((await handle(req(media, { headers: { range: `bytes=0-${MAX_RANGE}` } }), env, f)).status).toBe(416)
  })
  it('/stream suit les redirections googlevideo mais pas les autres', async () => {
    const seq = (loc: string) => {
      let n = 0
      return (async () => (n++ === 0 ? new Response(null, { status: 302, headers: { location: loc } }) : new Response('ok', { status: 206 }))) as typeof fetch
    }
    const range = { headers: { range: 'bytes=0-9' } }
    expect((await handle(req(media, range), env, seq('https://rr2.googlevideo.com/videoplayback?b=2'))).status).toBe(206)
    expect((await handle(req(media, range), env, seq('http://169.254.169.254/latest'))).status).toBe(502)
    expect((await handle(req(media, range), env, seq('https://evil.example/videoplayback'))).status).toBe(502)
  })
  it('/stream n\'expose pas un type de contenu actif', async () => {
    const f = (async () => new Response('<script>', { status: 206, headers: { 'content-type': 'text/html' } })) as typeof fetch
    const res = await handle(req(media, { headers: { range: 'bytes=0-9' } }), env, f)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })
  it('applique la limite de débit', async () => {
    const limited = { limit: async () => ({ success: false }) }
    expect((await handle(req('/info?v=dQw4w9WgXcQ'), { ...env, LIMITER: limited }, ok(player))).status).toBe(429)
  })
})

describe('parseRange', () => {
  it.each([['bytes=0-9', 'bytes=0-9'], ['bytes=5-4', null], ['bytes=0-', null], ['bytes=-5', null], ['items=0-5', null], [null, null]])('%s', (i, o) => expect(parseRange(i)).toBe(o))
})
