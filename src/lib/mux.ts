// Assemblage image + son sans ré-encodage, dans le navigateur (ffmpeg.wasm, chargé à la demande).
import type { FFmpeg } from '@ffmpeg/ffmpeg'

const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'
let instance: Promise<FFmpeg> | null = null

function load(): Promise<FFmpeg> {
  instance ??= (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')])
    const ff = new FFmpeg()
    await ff.load({
      coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    return ff
  })().catch((e) => {
    instance = null
    throw e
  })
  return instance
}

export async function mux(video: Blob, audio: Blob, ext: string, onProgress?: (ratio: number) => void): Promise<Blob> {
  const ff = await load()
  const vName = `video.${ext}`
  const aName = `audio.${ext === 'mp4' ? 'm4a' : ext}`
  const out = `out.${ext}`
  const handler = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)))
  ff.on('progress', handler)
  try {
    await ff.writeFile(vName, new Uint8Array(await video.arrayBuffer()))
    await ff.writeFile(aName, new Uint8Array(await audio.arrayBuffer()))
    const args = ['-i', vName, '-i', aName, '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy']
    if (ext === 'mp4') args.push('-movflags', '+faststart')
    const code = await ff.exec([...args, out])
    if (code !== 0) throw new Error(`ffmpeg exit ${code}`)
    const data = (await ff.readFile(out)) as Uint8Array
    return new Blob([data as BlobPart], { type: `video/${ext}` })
  } finally {
    ff.off('progress', handler)
    for (const f of [vName, aName, out]) await ff.deleteFile(f).catch(() => undefined)
  }
}
