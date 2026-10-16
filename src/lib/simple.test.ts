import { describe, expect, it } from 'vitest'
import { isYoutubeUrl, simpleFormatOf, SIMPLE_FORMATS } from './simple'
import { normalizeForm } from './form'
import { DEFAULT_FORM } from './payload'

describe('isYoutubeUrl', () => {
  it('accepte les adresses YouTube https', () => {
    for (const u of ['https://www.youtube.com/watch?v=x', 'https://youtu.be/x', 'https://m.youtube.com/watch?v=x', 'https://music.youtube.com/watch?v=x'])
      expect(isYoutubeUrl(u)).toBe(true)
  })
  it('refuse le reste', () => {
    for (const u of ['http://www.youtube.com/watch?v=x', 'https://example.com/v', 'https://youtube.com.evil.example/', 'https://u@www.youtube.com/x', 'pas une url'])
      expect(isYoutubeUrl(u)).toBe(false)
  })
})

describe('SIMPLE_FORMATS', () => {
  it('chaque format est valide pour le formulaire complet', () => {
    for (const f of SIMPLE_FORMATS) {
      const n = normalizeForm({ ...DEFAULT_FORM, type: f.type, format: f.format, quality: f.quality })
      expect([n.type, n.format, n.quality]).toEqual([f.type, f.format, f.quality])
    }
  })
  it('retrouve le format depuis les valeurs mémorisées, sinon MP4', () => {
    expect(simpleFormatOf({ type: 'audio', format: 'mp3', quality: 'best' }).id).toBe('mp3')
    expect(simpleFormatOf({ type: 'captions', format: 'srt', quality: 'best' }).id).toBe('mp4-best')
  })
})
