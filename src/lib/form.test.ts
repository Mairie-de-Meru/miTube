import { describe, expect, it } from 'vitest'
import { zipSync } from 'fflate'
import { DEFAULT_SETTINGS } from './settings'
import { normalizeForm, parsePresets, qualitiesFor, switchType, stringifyPresets } from './form'
import { readMeta, safeFileName, unzipBlob } from './files'
import { FormError } from './payload'

const D = DEFAULT_SETTINGS.defaults

describe('form', () => {
  it('remet la qualité à best quand le format ne la propose pas', () => {
    const f = normalizeForm({ ...D, type: 'audio' as const, format: 'm4a', quality: '320' })
    expect(f.quality).toBe('best')
    expect(normalizeForm({ ...D, type: 'audio' as const, format: 'mp3', quality: '320' }).quality).toBe('320')
  })
  it('choisit M4A pour audio et SRT pour sous-titres', () => {
    expect(switchType(D, 'audio', D).format).toBe('m4a')
    expect(switchType(D, 'captions', D).format).toBe('srt')
    expect(switchType({ ...D, type: 'audio' as const, format: 'mp3' }, 'video', D).format).toBe('any')
  })
  it('reprend les valeurs mémorisées du type par défaut', () => {
    const saved = { ...D, type: 'audio' as const, format: 'flac', quality: 'best' }
    expect(switchType(D, 'audio', saved).format).toBe('flac')
  })
  it('désactive les tags pour wav', () => {
    expect(normalizeForm({ ...D, type: 'audio' as const, format: 'wav' }).audioTags).toBe('none')
  })
  it('thumbnail n\'a pas de qualité', () => {
    expect(qualitiesFor('thumbnail', 'jpg')).toEqual([])
    expect(normalizeForm({ ...D, type: 'thumbnail' as const, quality: '720' }).quality).toBe('best')
  })
})

describe('presets', () => {
  it('parse et refuse les formes invalides', () => {
    expect(parsePresets('')).toEqual({})
    const p = parsePresets('{"a":{"x":1}}')
    expect(p).toEqual({ a: { x: 1 } })
    expect(parsePresets(stringifyPresets(p))).toEqual(p)
    expect(() => parsePresets('{')).toThrow(FormError)
    expect(() => parsePresets('[]')).toThrow(FormError)
    expect(() => parsePresets('{"a":1}')).toThrow(FormError)
  })
})

describe('files', () => {
  it('assainit les noms de fichiers', () => {
    expect(safeFileName('../../etc/pass:wd')).toBe('pass_wd')
    expect(safeFileName('..')).toBe('file')
    expect(safeFileName('a\u0000b.mp4')).toBe('a_b.mp4')
  })
  it('extrait un zip et lit result.json', async () => {
    const enc = new TextEncoder()
    const meta = { jobId: 'x', ok: true, error: null, items: [{ url: 'u', ok: true, title: 'T' }], files: [] }
    const zip = zipSync({ 'result.json': enc.encode(JSON.stringify(meta)), 'dir/a.txt': enc.encode('hi'), 'b/a.txt': enc.encode('yo') })
    const files = await unzipBlob(new Blob([zip as BlobPart]))
    expect(files.map((f) => f.name).sort()).toEqual(['2-a.txt', 'a.txt', 'result.json'])
    expect((await readMeta(new Blob([zip as BlobPart]))).items[0].title).toBe('T')
  })
})

describe('i18n', () => {
  it('a les mêmes clés en FR et EN, et interpole', async () => {
    const { makeT } = await import('../i18n')
    expect(makeT('fr')('entries', { n: 3 })).toBe('3 éléments')
    expect(makeT('en')('test.ok', { repo: 'a/b' })).toBe('Connected to a/b.')
  })
})
