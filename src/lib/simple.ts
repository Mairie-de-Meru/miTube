// Formats proposés par l'interface simple (mode public) : chacun correspond à un jeu de champs du formulaire complet.
import type { FormValues } from './form'

export interface SimpleFormat {
  id: string
  type: 'video' | 'audio'
  format: string
  quality: string
}

export const SIMPLE_FORMATS: SimpleFormat[] = [
  { id: 'mp4-best', type: 'video', format: 'mp4', quality: 'best' },
  { id: 'mp4-1080', type: 'video', format: 'mp4', quality: '1080' },
  { id: 'mp4-720', type: 'video', format: 'mp4', quality: '720' },
  { id: 'mp4-480', type: 'video', format: 'mp4', quality: '480' },
  { id: 'mp3', type: 'audio', format: 'mp3', quality: 'best' },
  { id: 'm4a', type: 'audio', format: 'm4a', quality: 'best' },
]

export const PUBLIC_MAX_URLS = 5

export const simpleFormatOf = (v: Pick<FormValues, 'type' | 'format' | 'quality'>): SimpleFormat =>
  SIMPLE_FORMATS.find((f) => f.type === v.type && f.format === v.format && f.quality === v.quality) ?? SIMPLE_FORMATS[0]

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'])

/** Même règle que scripts/ytdl_opts.py (is_public_url) : https et hôte YouTube, sans identifiant. */
export function isYoutubeUrl(text: string): boolean {
  try {
    const u = new URL(text)
    return u.protocol === 'https:' && YOUTUBE_HOSTS.has(u.hostname.toLowerCase()) && !u.username
  } catch {
    return false
  }
}
