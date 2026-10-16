import { DEFAULT_FORM, type DownloadForm } from './payload'
import type { LocalJob } from './jobs'

export type Theme = 'auto' | 'light' | 'dark'
export type Lang = 'en' | 'fr'

export interface Settings {
  repo: string
  theme: Theme
  lang: Lang
  /** Valeurs par défaut du formulaire d'ajout. */
  defaults: Omit<DownloadForm, 'urls'>
  /** Presets nommés d'options yt-dlp (équivalent de YTDL_OPTIONS_PRESETS). */
  presets: Record<string, Record<string, unknown>>
}

const KEY = 'metube-pages.settings'
const TOKEN_KEY = 'metube-pages.token'
const JOBS_KEY = 'metube-pages.jobs'

const { urls: _urls, ...DEFAULT_DEFAULTS } = DEFAULT_FORM
void _urls

export const DEFAULT_SETTINGS: Settings = {
  repo: '',
  theme: 'auto',
  lang: 'en',
  defaults: DEFAULT_DEFAULTS,
  presets: {},
}

// Le stockage peut être indisponible (navigation privée, blocage) : tout est protégé.
function read<T>(store: Storage | undefined, key: string): T | null {
  try {
    const raw = store?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function write(store: Storage | undefined, key: string, value: unknown) {
  try {
    store?.setItem(key, JSON.stringify(value))
  } catch {
    /* ignoré */
  }
}
const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage)
const session = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage)

export const detectLang = (): Lang =>
  typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'

export function loadSettings(): Settings {
  const saved = read<Partial<Settings>>(local(), KEY) ?? {}
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    lang: saved.lang ?? detectLang(),
    defaults: { ...DEFAULT_SETTINGS.defaults, ...saved.defaults },
  }
}
export const saveSettings = (s: Settings) => write(local(), KEY, s)

export interface StoredToken {
  token: string
  /** true : conservé sur cet appareil ; false : effacé à la fermeture de l'onglet. */
  remember: boolean
}
export function loadToken(): StoredToken {
  const l = read<string>(local(), TOKEN_KEY)
  if (l) return { token: l, remember: true }
  return { token: read<string>(session(), TOKEN_KEY) ?? '', remember: false }
}
export function saveToken({ token, remember }: StoredToken) {
  try {
    local()?.removeItem(TOKEN_KEY)
    session()?.removeItem(TOKEN_KEY)
  } catch {
    /* ignoré */
  }
  if (token) write(remember ? local() : session(), TOKEN_KEY, token)
}

export const loadLocalJobs = (): LocalJob[] => read<LocalJob[]>(local(), JOBS_KEY) ?? []
export const saveLocalJobs = (jobs: LocalJob[]) => write(local(), JOBS_KEY, jobs.slice(-200))

/** Efface réglages, jeton (les deux stockages) et historique local. */
export function clearAllLocalData() {
  for (const store of [local(), session()]) {
    try {
      for (const k of [KEY, TOKEN_KEY, JOBS_KEY]) store?.removeItem(k)
    } catch {
      /* ignoré */
    }
  }
}
