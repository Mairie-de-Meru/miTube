import { describe, expect, it } from 'vitest'
import { buildPayload, DEFAULT_FORM, FormError, parseUrls } from './payload'
import { detectRepo, parseRepo } from './github'
import { buildJobs, jobIdOfRun, statusOfRun, type LocalJob } from './jobs'
import type { Artifact, WorkflowRun } from './github'
import { formatBytes } from './format'

const run = (over: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id: 1, display_title: 'metube abcd1234', status: 'completed', conclusion: 'success',
  created_at: '2026-10-15T10:00:00Z', updated_at: '2026-10-15T10:01:00Z', html_url: 'https://github.com/o/r/actions/runs/1',
  ...over,
})
const art = (name: string, over: Partial<Artifact> = {}): Artifact => ({
  id: 9, name, size_in_bytes: 1000, expired: false, created_at: '', expires_at: null, ...over,
})

describe('payload', () => {
  it('dédoublonne et sépare les URL', () => {
    expect(parseUrls('https://a.io/1\nhttps://a.io/1, https://b.io/2')).toEqual(['https://a.io/1', 'https://b.io/2'])
  })
  it('construit une requête vidéo par défaut', () => {
    const p = buildPayload({ ...DEFAULT_FORM, urls: 'https://a.io/v' }, {}, 'job12345')
    expect(p).toMatchObject({ v: 1, jobId: 'job12345', type: 'video', quality: 'best', urls: ['https://a.io/v'] })
  })
  it('refuse une URL non http(s) ou vide', () => {
    expect(() => buildPayload({ ...DEFAULT_FORM, urls: '' })).toThrow(FormError)
    expect(() => buildPayload({ ...DEFAULT_FORM, urls: 'ftp://x.io/a' })).toThrow(FormError)
    expect(() => buildPayload({ ...DEFAULT_FORM, urls: 'pas une url' })).toThrow(FormError)
  })
  it('fusionne preset puis surcharge JSON', () => {
    const p = buildPayload(
      { ...DEFAULT_FORM, urls: 'https://a.io/v', preset: 'p', ytdlOptions: '{"retries": 9}' },
      { p: { retries: 1, geo_bypass: true } },
    )
    expect(p.ytdlOptions).toEqual({ retries: 9, geo_bypass: true })
  })
  it('refuse un JSON invalide ou non objet', () => {
    expect(() => buildPayload({ ...DEFAULT_FORM, urls: 'https://a.io/v', ytdlOptions: '{' })).toThrow(FormError)
    expect(() => buildPayload({ ...DEFAULT_FORM, urls: 'https://a.io/v', ytdlOptions: '[1]' })).toThrow(FormError)
  })
})

describe('github', () => {
  it('parse un dépôt', () => {
    expect(parseRepo('https://github.com/o/r.git')).toEqual({ owner: 'o', repo: 'r' })
    expect(parseRepo('pas un dépôt')).toBeNull()
  })
  it('détecte le dépôt depuis github.io', () => {
    expect(detectRepo({ hostname: 'bob.github.io', pathname: '/metube-pages/' })).toBe('bob/metube-pages')
    expect(detectRepo({ hostname: 'bob.github.io', pathname: '/' })).toBe('bob/bob.github.io')
    expect(detectRepo({ hostname: 'localhost', pathname: '/' })).toBe('')
  })
})

describe('jobs', () => {
  it('extrait le job id du titre du run', () => {
    expect(jobIdOfRun(run())).toBe('abcd1234')
    expect(jobIdOfRun(run({ display_title: 'autre chose' }))).toBeNull()
  })
  it('déduit le statut', () => {
    expect(statusOfRun(run({ status: 'queued', conclusion: null }))).toBe('queued')
    expect(statusOfRun(run({ status: 'in_progress', conclusion: null }))).toBe('running')
    expect(statusOfRun(run(), art('x'))).toBe('done')
    expect(statusOfRun(run(), art('x', { expired: true }))).toBe('expired')
    expect(statusOfRun(run({ conclusion: 'failure' }))).toBe('failed')
    expect(statusOfRun(run({ conclusion: 'failure' }), art('x'))).toBe('done')
    expect(statusOfRun(run({ conclusion: 'cancelled' }))).toBe('cancelled')
  })
  it('fusionne runs, artefacts et envois locaux', () => {
    const local: LocalJob[] = [
      { jobId: 'abcd1234', createdAt: 1, request: { urls: ['https://a.io/v'], type: 'video', format: 'any', quality: 'best', codec: 'auto' } },
      { jobId: 'newjob99', createdAt: Date.parse('2026-10-15T10:00:30Z'), request: { urls: ['https://a.io/w'], type: 'audio', format: 'mp3', quality: 'best', codec: 'auto' } },
      { jobId: 'oldjob99', createdAt: Date.parse('2026-10-15T09:00:00Z'), request: { urls: ['https://a.io/z'], type: 'audio', format: 'mp3', quality: 'best', codec: 'auto' } },
    ]
    const jobs = buildJobs([run()], [art('metube-abcd1234')], local, {}, Date.parse('2026-10-15T10:01:00Z'))
    expect(jobs.map((j) => [j.id, j.status])).toEqual([['newjob99', 'sending'], ['abcd1234', 'done']])
    expect(jobs.find((j) => j.id === 'abcd1234')?.request?.urls[0]).toBe('https://a.io/v')
  })
})

describe('format', () => {
  it('formate les tailles', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB')
  })
})
