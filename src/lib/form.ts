// Logique pure du formulaire : valeurs par défaut selon le type, normalisation, presets.
import {
  AUDIO_FORMATS, CAPTION_FORMATS, CAPTION_MODES, CODECS, VIDEO_FORMATS, VIDEO_QUALITIES,
  type DownloadType, type Option,
} from './catalog'
import { DEFAULT_FORM, FormError, type DownloadForm } from './payload'

export type FormValues = Omit<DownloadForm, 'urls'>

export const formatsFor = (type: DownloadType): Option[] =>
  type === 'video' ? VIDEO_FORMATS : type === 'audio' ? AUDIO_FORMATS : type === 'captions' ? CAPTION_FORMATS : []

export function qualitiesFor(type: DownloadType, format: string): Option[] {
  if (type === 'video') return VIDEO_QUALITIES
  if (type === 'audio') return (AUDIO_FORMATS.find((f) => f.id === format) ?? AUDIO_FORMATS[1]).qualities
  return []
}

export const audioHasTags = (format: string): boolean => AUDIO_FORMATS.find((f) => f.id === format)?.tags ?? true

/** Format par défaut de chaque type (identique à MeTube / ytdl_opts.py). */
export const DEFAULT_FORMAT: Record<DownloadType, string> = {
  video: 'any',
  audio: 'm4a',
  captions: 'srt',
  thumbnail: 'jpg',
}

const has = (list: Option[], id: string) => list.some((o) => o.id === id)

/** Rend les champs cohérents : format valide pour le type, qualité remise à « best » si absente du format. */
export function normalizeForm<T extends FormValues>(f: T): T {
  const out = { ...f }
  const formats = formatsFor(out.type)
  if (formats.length === 0) out.format = DEFAULT_FORMAT[out.type]
  else if (!has(formats, out.format)) out.format = DEFAULT_FORMAT[out.type]
  const qualities = qualitiesFor(out.type, out.format)
  if (qualities.length === 0) out.quality = 'best'
  else if (!has(qualities, out.quality)) out.quality = 'best'
  if (!has(CODECS, out.codec)) out.codec = 'auto'
  if (out.type === 'audio' && !audioHasTags(out.format)) out.audioTags = 'none'
  else if (out.type === 'audio' && out.audioTags === 'none' && audioHasTags(out.format) && f.audioTags !== 'none') out.audioTags = f.audioTags
  if (!has(CAPTION_MODES, out.subtitleMode)) out.subtitleMode = DEFAULT_FORM.subtitleMode
  return out
}

/** Change de type : reprend le format/qualité mémorisés si le type est celui des valeurs par défaut. */
export function switchType<T extends FormValues>(form: T, type: DownloadType, defaults: FormValues): T {
  const base = defaults.type === type ? defaults : { ...form, format: DEFAULT_FORMAT[type], quality: 'best' }
  return normalizeForm({ ...form, type, format: base.format, quality: base.quality, codec: base.codec })
}

export type Presets = Record<string, Record<string, unknown>>

export function parsePresets(text: string): Presets {
  const t = text.trim()
  if (!t) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(t)
  } catch {
    throw new FormError('Presets: invalid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new FormError('Presets: expected a JSON object')
  const out: Presets = {}
  for (const [name, value] of Object.entries(parsed)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new FormError(`Presets: "${name}" must be a JSON object`)
    }
    out[name] = value as Record<string, unknown>
  }
  return out
}

export const stringifyPresets = (p: Presets): string => (Object.keys(p).length ? JSON.stringify(p, null, 2) : '')
