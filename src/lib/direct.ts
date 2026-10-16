import type { WorkerError, WorkerFormat, WorkerInfo } from '../../worker/src/types'

export type { WorkerFormat, WorkerInfo }

export type DirectType = 'video' | 'audio'
/** 'best' ou une hauteur maximale en pixels. */
export const DIRECT_QUALITIES = ['best', '2160', '1440', '1080', '720', '480', '360', '240'] as const
export type DirectQuality = (typeof DIRECT_QUALITIES)[number]

export interface Plan {
  /** Image seule (ou fichier complet si `audio` est absent). */
  video?: WorkerFormat
  audio?: WorkerFormat
  ext: string
}

export class DirectError extends Error {
  reason?: string
  constructor(code: string, reason?: string) {
    super(code)
    this.reason = reason
  }
}

/** URL du Worker : https obligatoire (http seulement en local). Chaîne vide si invalide. */
export function normalizeWorkerUrl(raw: string): string {
  const s = raw.trim().replace(/\/+$/, '')
  if (!s) return ''
  try {
    const u = new URL(s)
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return ''
    if (u.search || u.hash) return ''
    return u.origin + (u.pathname === '/' ? '' : u.pathname)
  } catch {
    return ''
  }
}

const byBitrate = (a: WorkerFormat, b: WorkerFormat) => b.bitrate - a.bitrate

/** Choisit les flux à télécharger pour un type et une qualité demandés. Lève DirectError('NO_MATCH'). */
export function planDownload(info: WorkerInfo, type: DirectType, quality: DirectQuality | string): Plan {
  const audios = info.formats.filter((f) => f.kind === 'audio')
  const pickAudio = (ext?: string) => {
    const list = (ext ? audios.filter((f) => f.ext === ext) : audios).sort(byBitrate)
    return list[0]
  }
  if (type === 'audio') {
    const audio = pickAudio('m4a') ?? pickAudio()
    if (!audio) throw new DirectError('NO_MATCH', 'No audio stream')
    return { audio, ext: audio.ext }
  }
  const max = quality === 'best' ? Infinity : Number(quality) || Infinity
  const candidates = info.formats.filter((f) => f.kind !== 'audio' && f.height > 0)
  if (candidates.length === 0) throw new DirectError('NO_MATCH', 'No video stream')
  // MP4/H.264 d'abord (lisible partout), puis tout autre codec.
  const preferred = candidates.filter((f) => f.ext === 'mp4' && f.codec.startsWith('avc1'))
  const pool = preferred.length ? preferred : candidates
  const within = pool.filter((f) => f.height <= max).sort((a, b) => b.height - a.height || byBitrate(a, b))
  const video = within[0] ?? [...pool].sort((a, b) => a.height - b.height || byBitrate(a, b))[0]!
  if (video.kind === 'muxed') return { video, ext: video.ext }
  const audio = pickAudio(video.ext === 'mp4' ? 'm4a' : video.ext) ?? pickAudio()
  if (!audio) throw new DirectError('NO_MATCH', 'No audio stream')
  return { video, audio, ext: video.ext }
}

export async function fetchWorkerInfo(base: string, input: string, signal?: AbortSignal): Promise<WorkerInfo> {
  const res = await fetch(`${base}/info?v=${encodeURIComponent(input)}`, { signal })
  const body = (await res.json().catch(() => ({ error: `HTTP_${res.status}` }))) as WorkerInfo | WorkerError
  if (!res.ok || 'error' in body) {
    const e = body as WorkerError
    throw new DirectError(e.error ?? `HTTP_${res.status}`, e.reason)
  }
  return body
}

const CHUNK = 8 * 1024 * 1024
const PARALLEL = 3

async function fetchRange(base: string, f: WorkerFormat, start: number, end: number, signal?: AbortSignal): Promise<Uint8Array> {
  let last: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const res = await fetch(`${base}/stream?u=${encodeURIComponent(f.url)}`, { headers: { range: `bytes=${start}-${end}` }, signal })
      if (res.status !== 206 && res.status !== 200) throw new DirectError(`HTTP_${res.status}`)
      const data = new Uint8Array(await res.arrayBuffer())
      if (res.status === 200 && (start !== 0 || data.length > end - start + 1)) return data.subarray(start, end + 1)
      return data
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      last = e
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
  }
  throw last instanceof Error ? last : new DirectError('DOWNLOAD_FAILED')
}

/** Télécharge un flux par tranches de 8 Mo (3 en parallèle) via le Worker. onProgress reçoit un ratio 0..1. */
export async function downloadFormat(
  base: string,
  f: WorkerFormat,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  if (f.size <= 0) throw new DirectError('NO_SIZE', 'Unknown stream size')
  const count = Math.ceil(f.size / CHUNK)
  const parts: Uint8Array[] = new Array(count)
  let next = 0
  let done = 0
  const run = async () => {
    for (;;) {
      const i = next++
      if (i >= count) return
      const start = i * CHUNK
      parts[i] = await fetchRange(base, f, start, Math.min(f.size, start + CHUNK) - 1, signal)
      done += parts[i]!.length
      onProgress(Math.min(1, done / f.size))
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, count) }, run))
  const mime = f.kind === 'audio' ? `audio/${f.ext === 'm4a' ? 'mp4' : f.ext}` : `video/${f.ext}`
  return new Blob(parts as BlobPart[], { type: mime })
}

/** Nom de fichier sûr à partir d'un titre. */
export function fileNameFor(title: string, ext: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = title.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_').replace(/^\.+/, '').trim().slice(0, 150)
  return `${clean || 'video'}.${ext}`
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
