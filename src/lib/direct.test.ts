import { describe, expect, it } from 'vitest'
import { DirectError, fileNameFor, normalizeWorkerUrl, planDownload, type WorkerFormat, type WorkerInfo } from './direct'

const f = (o: Partial<WorkerFormat>): WorkerFormat => ({ itag: 0, kind: 'video', ext: 'mp4', codec: 'avc1.4d', height: 0, fps: 30, bitrate: 1, size: 1, url: 'u', ...o })
const info = (formats: WorkerFormat[]): WorkerInfo => ({ id: 'x', title: 't', author: 'a', lengthSeconds: 1, thumbnail: '', formats })

const FORMATS = [
  f({ itag: 137, height: 1080 }),
  f({ itag: 136, height: 720 }),
  f({ itag: 135, height: 480 }),
  f({ itag: 399, height: 1080, codec: 'av01.0', bitrate: 99 }),
  f({ itag: 248, height: 1080, ext: 'webm', codec: 'vp09' }),
  f({ itag: 139, kind: 'audio', ext: 'm4a', codec: 'mp4a.40.5', bitrate: 48 }),
  f({ itag: 140, kind: 'audio', ext: 'm4a', codec: 'mp4a.40.2', bitrate: 128 }),
  f({ itag: 251, kind: 'audio', ext: 'webm', codec: 'opus', bitrate: 160 }),
]

describe('planDownload', () => {
  it('meilleure qualité : H.264 le plus haut + meilleur M4A', () => {
    const p = planDownload(info(FORMATS), 'video', 'best')
    expect([p.video?.itag, p.audio?.itag, p.ext]).toEqual([137, 140, 'mp4'])
  })
  it('respecte la hauteur maximale', () => {
    expect(planDownload(info(FORMATS), 'video', '720').video?.itag).toBe(136)
    expect(planDownload(info(FORMATS), 'video', '500').video?.itag).toBe(135)
  })
  it('qualité plus basse indisponible : prend la plus petite au-dessus', () => {
    expect(planDownload(info(FORMATS), 'video', '240').video?.itag).toBe(135)
  })
  it('préfère un fichier complet (muxed) sans demander d\'audio', () => {
    const p = planDownload(info([f({ itag: 22, kind: 'muxed', height: 720 }), ...FORMATS.slice(5)]), 'video', '720')
    expect([p.video?.itag, p.audio]).toEqual([22, undefined])
  })
  it('sans H.264 : retombe sur un autre codec avec l\'audio du même conteneur', () => {
    const p = planDownload(info([f({ itag: 248, height: 720, ext: 'webm', codec: 'vp09' }), ...FORMATS.slice(5)]), 'video', 'best')
    expect([p.video?.itag, p.audio?.itag, p.ext]).toEqual([248, 251, 'webm'])
  })
  it('audio seul : M4A de meilleur débit', () => {
    const p = planDownload(info(FORMATS), 'audio', 'best')
    expect([p.video, p.audio?.itag, p.ext]).toEqual([undefined, 140, 'm4a'])
  })
  it('lève NO_MATCH sans flux utilisable', () => {
    expect(() => planDownload(info([]), 'video', 'best')).toThrow(DirectError)
    expect(() => planDownload(info(FORMATS.slice(0, 3)), 'audio', 'best')).toThrow(DirectError)
  })
})

describe('normalizeWorkerUrl', () => {
  it.each([
    ['https://w.example.workers.dev/', 'https://w.example.workers.dev'],
    ['  https://w.example.workers.dev  ', 'https://w.example.workers.dev'],
    ['http://localhost:8787', 'http://localhost:8787'],
    ['https://host/base/', 'https://host/base'],
  ])('%s', (i, o) => expect(normalizeWorkerUrl(i)).toBe(o))
  it.each(['', 'http://evil.example', 'ftp://x', 'nope', 'https://h/?a=1'])('rejette %s', (i) => expect(normalizeWorkerUrl(i)).toBe(''))
})

describe('fileNameFor', () => {
  it('nettoie le titre', () => expect(fileNameFor('a/b:c*"d"', 'mp4')).toBe('a_b_c__d_.mp4'))
  it('titre vide', () => expect(fileNameFor('  ', 'm4a')).toBe('video.m4a'))
})
