// Options de téléchargement : reprend le catalogue de MeTube (app/format_catalog.py)
// et DOIT rester aligné avec scripts/ytdl_opts.py (le workflow rejette le reste).

export interface Option {
  id: string
  text: string
}

export type DownloadType = 'video' | 'audio' | 'captions' | 'thumbnail'

export const DOWNLOAD_TYPES: Option[] = [
  { id: 'video', text: 'Video' },
  { id: 'audio', text: 'Audio' },
  { id: 'captions', text: 'Captions' },
  { id: 'thumbnail', text: 'Thumbnail' },
]

export const VIDEO_QUALITIES: Option[] = [
  { id: 'best', text: 'Best' },
  ...['2160', '1440', '1080', '720', '480', '360', '240'].map((q) => ({ id: q, text: `${q}p` })),
  { id: 'worst', text: 'Worst' },
]

export const VIDEO_FORMATS: Option[] = [
  { id: 'any', text: 'Auto' },
  { id: 'mp4', text: 'MP4' },
  { id: 'ios', text: 'iOS Compatible' },
]

export const CODECS: Option[] = [
  { id: 'auto', text: 'Auto' },
  { id: 'h264', text: 'H.264' },
  { id: 'h265', text: 'H.265 (HEVC)' },
  { id: 'av1', text: 'AV1' },
  { id: 'vp9', text: 'VP9' },
]

const bitrates = (...b: string[]): Option[] => [
  { id: 'best', text: 'Best' },
  ...b.map((x) => ({ id: x, text: `${x} kbps` })),
]

export interface AudioFormat extends Option {
  qualities: Option[]
  tags: boolean
}

export const AUDIO_FORMATS: AudioFormat[] = [
  { id: 'auto', text: 'Auto', qualities: bitrates(), tags: true },
  { id: 'm4a', text: 'M4A', qualities: bitrates('192', '128'), tags: true },
  { id: 'mp3', text: 'MP3', qualities: bitrates('320', '192', '128'), tags: true },
  { id: 'opus', text: 'OPUS', qualities: bitrates(), tags: true },
  { id: 'wav', text: 'WAV', qualities: bitrates(), tags: false },
  { id: 'flac', text: 'FLAC', qualities: bitrates(), tags: true },
]

export const AUDIO_TAGS: Option[] = [
  { id: 'with_cover', text: 'With cover' },
  { id: 'no_cover', text: 'No cover' },
  { id: 'none', text: 'None' },
]

export const CAPTION_FORMATS: Option[] = [
  { id: 'srt', text: 'SRT' },
  { id: 'txt', text: 'TXT (Text only)' },
  { id: 'vtt', text: 'VTT' },
  { id: 'ttml', text: 'TTML' },
  { id: 'sbv', text: 'SBV' },
  { id: 'scc', text: 'SCC' },
  { id: 'dfxp', text: 'DFXP' },
]

export const CAPTION_MODES: Option[] = [
  { id: 'prefer_manual', text: 'Prefer Manual' },
  { id: 'prefer_auto', text: 'Prefer Auto' },
  { id: 'manual_only', text: 'Manual Only' },
  { id: 'auto_only', text: 'Auto Only' },
]

export const SUBTITLE_LANGUAGES: Option[] = [
  ['en', 'English'], ['ar', 'Arabic'], ['bn', 'Bengali'], ['bg', 'Bulgarian'], ['ca', 'Catalan'],
  ['cs', 'Czech'], ['da', 'Danish'], ['nl', 'Dutch'], ['es', 'Spanish'], ['et', 'Estonian'],
  ['fi', 'Finnish'], ['fr', 'French'], ['de', 'German'], ['el', 'Greek'], ['he', 'Hebrew'],
  ['hi', 'Hindi'], ['hu', 'Hungarian'], ['id', 'Indonesian'], ['it', 'Italian'], ['lt', 'Lithuanian'],
  ['lv', 'Latvian'], ['ms', 'Malay'], ['no', 'Norwegian'], ['pl', 'Polish'], ['pt', 'Portuguese'],
  ['pt-BR', 'Portuguese (Brazil)'], ['ro', 'Romanian'], ['ru', 'Russian'], ['sk', 'Slovak'],
  ['sl', 'Slovenian'], ['sr', 'Serbian'], ['sv', 'Swedish'], ['ta', 'Tamil'], ['te', 'Telugu'],
  ['th', 'Thai'], ['tr', 'Turkish'], ['uk', 'Ukrainian'], ['ur', 'Urdu'], ['vi', 'Vietnamese'],
  ['ja', 'Japanese'], ['ko', 'Korean'], ['zh-Hans', 'Chinese (Simplified)'], ['zh-Hant', 'Chinese (Traditional)'],
].map(([id, text]) => ({ id, text }))

export const SUBTITLE_LANGUAGE_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,34}$/
