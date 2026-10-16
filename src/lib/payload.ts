import { SUBTITLE_LANGUAGE_RE, type DownloadType } from './catalog'

/** Formulaire d'ajout (mêmes champs que MeTube). */
export interface DownloadForm {
  urls: string
  type: DownloadType
  format: string
  quality: string
  codec: string
  audioTags: string
  subtitleMode: string
  subtitleLanguage: string
  playlistLimit: number
  splitChapters: boolean
  outputTemplate: string
  /** Surcharges yt-dlp, JSON (équivalent des « overrides » de MeTube). */
  ytdlOptions: string
  preset: string
  /** Instances Invidious (une par ligne ou séparées par des virgules), repli si YouTube bloque yt-dlp. */
  invidiousInstances: string
}

export const DEFAULT_FORM: DownloadForm = {
  urls: '',
  type: 'video',
  format: 'any',
  quality: 'best',
  codec: 'auto',
  audioTags: 'with_cover',
  subtitleMode: 'prefer_manual',
  subtitleLanguage: 'en',
  playlistLimit: 0,
  splitChapters: false,
  outputTemplate: '',
  ytdlOptions: '',
  preset: '',
  invidiousInstances: '',
}

/** Requête envoyée au workflow (version 1, validée côté Python par ytdl_opts.normalize). */
export interface Payload {
  v: 1
  jobId: string
  urls: string[]
  type: DownloadType
  format: string
  quality: string
  codec: string
  audioTags: string
  subtitleMode: string
  subtitleLanguage: string
  playlistLimit: number
  splitChapters: boolean
  outputTemplate: string
  ytdlOptions: Record<string, unknown>
  invidiousInstances?: string[]
}

export class FormError extends Error {}

export function parseUrls(text: string): string[] {
  const seen = new Set<string>()
  for (const raw of text.split(/[\s,]+/)) {
    const u = raw.trim()
    if (u && !seen.has(u)) seen.add(u)
  }
  return [...seen]
}

export function newJobId(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  const rand = [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('')
  return `${Date.now().toString(36)}${rand}`
}

export function parseYtdlOptions(text: string): Record<string, unknown> {
  const t = text.trim()
  if (!t) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(t)
  } catch {
    throw new FormError('yt-dlp options: invalid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new FormError('yt-dlp options: expected a JSON object')
  }
  return parsed as Record<string, unknown>
}

export function buildPayload(
  form: DownloadForm,
  presets: Record<string, Record<string, unknown>> = {},
  jobId: string = newJobId(),
): Payload {
  const urls = parseUrls(form.urls)
  if (urls.length === 0) throw new FormError('Enter at least one URL')
  if (urls.length > 50) throw new FormError('At most 50 URLs per request')
  for (const u of urls) {
    try {
      const { protocol } = new URL(u)
      if (protocol !== 'http:' && protocol !== 'https:') throw new Error()
    } catch {
      throw new FormError(`Invalid URL: ${u.slice(0, 80)}`)
    }
  }
  if (form.type === 'captions' && !SUBTITLE_LANGUAGE_RE.test(form.subtitleLanguage)) {
    throw new FormError('Invalid subtitle language')
  }
  const limit = Math.trunc(Number(form.playlistLimit) || 0)
  if (limit < 0 || limit > 10000) throw new FormError('Items limit out of range')
  const instances = parseUrls(form.invidiousInstances)
  for (const u of instances) {
    try {
      if (new URL(u).protocol !== 'https:') throw new Error()
    } catch {
      throw new FormError(`Invalid Invidious instance (https required): ${u.slice(0, 80)}`)
    }
  }
  const preset = form.preset ? (presets[form.preset] ?? {}) : {}
  return {
    v: 1,
    jobId,
    urls,
    type: form.type,
    format: form.format,
    quality: form.quality,
    codec: form.codec,
    audioTags: form.audioTags,
    subtitleMode: form.subtitleMode,
    subtitleLanguage: form.subtitleLanguage,
    playlistLimit: limit,
    splitChapters: form.splitChapters,
    outputTemplate: form.outputTemplate.trim(),
    ytdlOptions: { ...preset, ...parseYtdlOptions(form.ytdlOptions) },
    ...(instances.length ? { invidiousInstances: instances } : {}),
  }
}
