import type { WorkerFormat, WorkerInfo } from './types'

// Client « IOS » de l'API interne de YouTube : renvoie des URL directes (pas de signature à déchiffrer)
// et, au 2026-10-15, n'exige pas de jeton PO pour un accès ponctuel. Peut cesser de fonctionner sans préavis.
export const IOS_VERSION = '20.10.4'
export const IOS_UA = `com.google.ios.youtube/${IOS_VERSION} (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)`

const ID_RE = /^[\w-]{11}$/

/** Extrait l'identifiant d'une vidéo depuis un identifiant nu ou une URL YouTube. null si invalide. */
export function parseVideoId(input: string): string | null {
  const s = input.trim()
  if (ID_RE.test(s)) return s
  let url: URL
  try {
    url = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, kind, second] = url.pathname.split('/')
    if (kind === 'watch') id = url.searchParams.get('v')
    else if (['shorts', 'embed', 'live', 'v'].includes(kind ?? '')) id = second ?? null
  }
  return id && ID_RE.test(id) ? id : null
}

/** Seuls les serveurs de médias de YouTube sont relayés : le Worker n'est pas un proxy ouvert. */
export function isAllowedStreamUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    !url.port &&
    !url.username &&
    !url.password &&
    url.pathname === '/videoplayback' &&
    /^[a-z0-9-]+(\.[a-z0-9-]+)*\.googlevideo\.com$/i.test(url.hostname)
  )
}

interface RawFormat {
  itag?: number
  url?: string
  mimeType?: string
  width?: number
  height?: number
  fps?: number
  bitrate?: number
  contentLength?: string
  audioQuality?: string
  audioTrack?: { audioIsDefault?: boolean }
}

function mapFormat(f: RawFormat, muxed: boolean): WorkerFormat | null {
  const m = /^(video|audio)\/(\w+);\s*codecs="([^"]+)"/.exec(f.mimeType ?? '')
  if (!m || !f.url || typeof f.itag !== 'number') return null
  if (f.audioTrack && f.audioTrack.audioIsDefault === false) return null // pistes doublées : on garde l'originale
  const [, type, container, codecs] = m
  const ext = type === 'audio' ? (container === 'mp4' ? 'm4a' : container) : container
  return {
    itag: f.itag,
    kind: muxed ? 'muxed' : (type as 'video' | 'audio'),
    ext: ext ?? 'mp4',
    codec: (codecs ?? '').split(',')[0]!.trim(),
    height: f.height ?? 0,
    fps: f.fps ?? 0,
    bitrate: f.bitrate ?? 0,
    size: Number(f.contentLength) || 0,
    url: f.url,
  }
}

interface PlayerResponse {
  playabilityStatus?: { status?: string; reason?: string }
  videoDetails?: { videoId?: string; title?: string; author?: string; lengthSeconds?: string; thumbnail?: { thumbnails?: { url: string; width?: number }[] } }
  streamingData?: { formats?: RawFormat[]; adaptiveFormats?: RawFormat[] }
}

export class YouTubeError extends Error {
  reason?: string
  constructor(message: string, reason?: string) {
    super(message)
    this.reason = reason
  }
}

export function parsePlayerResponse(data: PlayerResponse, id: string): WorkerInfo {
  const status = data.playabilityStatus?.status
  if (status !== 'OK') {
    throw new YouTubeError(status ?? 'UNKNOWN', data.playabilityStatus?.reason)
  }
  const sd = data.streamingData
  const formats = [
    ...(sd?.formats ?? []).map((f) => mapFormat(f, true)),
    ...(sd?.adaptiveFormats ?? []).map((f) => mapFormat(f, false)),
  ].filter((f): f is WorkerFormat => f !== null)
  if (formats.length === 0) throw new YouTubeError('NO_FORMATS', 'No downloadable format returned')
  const d = data.videoDetails
  const thumbs = d?.thumbnail?.thumbnails ?? []
  return {
    id,
    title: d?.title ?? id,
    author: d?.author ?? '',
    lengthSeconds: Number(d?.lengthSeconds) || 0,
    thumbnail: thumbs[thumbs.length - 1]?.url ?? '',
    formats,
  }
}

export async function fetchInfo(id: string, fetcher: typeof fetch = fetch): Promise<WorkerInfo> {
  const res = await fetcher('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': IOS_UA },
    body: JSON.stringify({
      videoId: id,
      contentCheckOk: true,
      racyCheckOk: true,
      context: {
        client: {
          clientName: 'IOS',
          clientVersion: IOS_VERSION,
          hl: 'en',
          deviceMake: 'Apple',
          deviceModel: 'iPhone16,2',
          osName: 'iPhone',
          osVersion: '18.3.2.22D82',
        },
      },
    }),
  })
  if (!res.ok) throw new YouTubeError(`HTTP_${res.status}`, `YouTube answered ${res.status}`)
  return parsePlayerResponse((await res.json()) as PlayerResponse, id)
}
