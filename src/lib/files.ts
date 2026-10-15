import { unzipSync } from 'fflate'
import type { ResultMeta } from './jobs'

/** Nom de fichier issu d'un zip (non fiable) : dernier segment, sans caractères de contrôle. */
export function safeFileName(path: string, fallback = 'file'): string {
  const base = path.split(/[\\/]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').replace(/^\.+/, '').trim().slice(0, 200)
  return clean || fallback
}

export interface ExtractedFile {
  name: string
  data: Uint8Array
}

export async function unzipBlob(blob: Blob): Promise<ExtractedFile[]> {
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()))
  const out: ExtractedFile[] = []
  const used = new Set<string>()
  for (const [path, data] of Object.entries(entries)) {
    if (path.endsWith('/')) continue
    let name = safeFileName(path)
    for (let i = 2; used.has(name); i++) name = `${i}-${safeFileName(path)}`
    used.add(name)
    out.push({ name, data })
  }
  return out
}

export async function readMeta(blob: Blob): Promise<ResultMeta> {
  const file = (await unzipBlob(blob)).find((f) => f.name === 'result.json')
  if (!file) throw new Error('result.json missing')
  const meta = JSON.parse(new TextDecoder().decode(file.data)) as ResultMeta
  if (!meta || typeof meta !== 'object' || !Array.isArray(meta.items)) throw new Error('invalid result.json')
  return meta
}
