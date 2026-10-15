// Abonnements : logique pure. Le fichier vit sur la branche `metube-data` ; `seen`, `lastChecked`
// et `lastError` appartiennent au workflow et ne doivent jamais être écrasés par l'interface.
import type { Payload } from './payload'

export interface SubscriptionRequest {
  type: string
  format: string
  quality: string
  codec: string
  audioTags?: string
  subtitleMode?: string
  subtitleLanguage?: string
  playlistLimit?: number
  splitChapters?: boolean
  outputTemplate?: string
  ytdlOptions?: Record<string, unknown>
}

export interface Subscription {
  id: string
  url: string
  name: string
  enabled: boolean
  intervalHours: number
  scan: number
  request: SubscriptionRequest
  seen: string[]
  lastChecked: number
  lastError: string | null
}

export interface SubscriptionsFile {
  subscriptions: Subscription[]
}

export const RUNTIME_KEYS = ['seen', 'lastChecked', 'lastError'] as const

export function newSubscriptionId(): string {
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-4).padStart(4, '0')
}

const clamp = (n: number, lo: number, hi: number, fallback: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : fallback

export function requestFromPayload(p: Payload): SubscriptionRequest {
  const r: SubscriptionRequest = {
    type: p.type, format: p.format, quality: p.quality, codec: p.codec,
    audioTags: p.audioTags, subtitleMode: p.subtitleMode, subtitleLanguage: p.subtitleLanguage,
    playlistLimit: p.playlistLimit, splitChapters: p.splitChapters,
  }
  if (p.outputTemplate) r.outputTemplate = p.outputTemplate
  if (Object.keys(p.ytdlOptions).length) r.ytdlOptions = p.ytdlOptions
  return r
}

export function createSubscription(
  input: { url: string; name?: string; intervalHours: number; scan: number; request: SubscriptionRequest },
  id: string = newSubscriptionId(),
): Subscription {
  return {
    id,
    url: input.url.trim(),
    name: (input.name ?? '').trim() || input.url.trim(),
    enabled: true,
    intervalHours: clamp(input.intervalHours, 1, 168, 12),
    scan: clamp(input.scan, 1, 100, 20),
    request: input.request,
    seen: [],
    lastChecked: 0,
    lastError: null,
  }
}

export const addSubscription = (list: Subscription[], sub: Subscription): Subscription[] => [
  ...list.filter((s) => s.id !== sub.id),
  sub,
]
export const updateSubscription = (list: Subscription[], id: string, patch: Partial<Subscription>): Subscription[] =>
  list.map((s) => (s.id === id ? { ...s, ...patch, id } : s))
export const removeSubscription = (list: Subscription[], id: string): Subscription[] => list.filter((s) => s.id !== id)

/**
 * Fusionne la liste locale (état voulu) dans la version distante fraîche : les champs éditables viennent
 * du local, seen/lastChecked/lastError de la version distante ; les abonnements ajoutés ailleurs sont gardés
 * sauf s'ils figurent dans `removed`.
 */
export function mergeForSave(remote: Subscription[], local: Subscription[], removed: string[] = []): Subscription[] {
  const remoteById = new Map(remote.map((s) => [s.id, s]))
  const localIds = new Set(local.map((s) => s.id))
  const merged = local
    .filter((s) => !removed.includes(s.id))
    .map((s) => {
      const r = remoteById.get(s.id)
      return r ? { ...s, seen: r.seen, lastChecked: r.lastChecked, lastError: r.lastError } : s
    })
  const others = remote.filter((s) => !localIds.has(s.id) && !removed.includes(s.id))
  return [...merged, ...others]
}

export function parseSubscriptionsFile(text: string): SubscriptionsFile {
  const parsed = JSON.parse(text) as Partial<SubscriptionsFile> | null
  const list = Array.isArray(parsed?.subscriptions) ? parsed.subscriptions : []
  return {
    subscriptions: list
      .filter((s): s is Subscription => !!s && typeof s.id === 'string' && typeof s.url === 'string')
      .map((s) => ({
        ...s,
        name: s.name || s.url,
        enabled: s.enabled !== false,
        seen: Array.isArray(s.seen) ? s.seen : [],
        lastChecked: Number(s.lastChecked) || 0,
        lastError: s.lastError ?? null,
        request: s.request ?? { type: 'video', format: 'any', quality: 'best', codec: 'auto' },
      })),
  }
}
