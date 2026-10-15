import { describe, expect, it } from 'vitest'
import {
  addSubscription, createSubscription, mergeForSave, newSubscriptionId, parseSubscriptionsFile,
  removeSubscription, updateSubscription,
} from './subscriptions'
import { base64ToUtf8, utf8ToBase64 } from './github'

const req = { type: 'video', format: 'any', quality: 'best', codec: 'auto' }
const sub = (id: string, over = {}) => ({ ...createSubscription({ url: 'https://y.io/c', intervalHours: 12, scan: 20, request: req }, id), ...over })

describe('subscriptions', () => {
  it('génère des identifiants valides', () => {
    for (let i = 0; i < 20; i++) expect(newSubscriptionId()).toMatch(/^[a-z0-9]{12,}$/)
  })
  it('borne intervalle et analyse, nom par défaut = URL', () => {
    const s = createSubscription({ url: ' https://y.io/c ', intervalHours: 999, scan: 0, request: req })
    expect(s).toMatchObject({ intervalHours: 168, scan: 1, name: 'https://y.io/c', enabled: true, seen: [], lastChecked: 0 })
  })
  it('ajoute, modifie, supprime', () => {
    let l = addSubscription([], sub('a'))
    l = addSubscription(l, sub('b'))
    l = updateSubscription(l, 'a', { enabled: false, id: 'zzz' })
    expect(l.find((s) => s.id === 'a')?.enabled).toBe(false)
    expect(removeSubscription(l, 'a').map((s) => s.id)).toEqual(['b'])
  })
  it('mergeForSave garde seen/lastChecked/lastError distants', () => {
    const remote = [sub('a', { seen: ['x'], lastChecked: 99, lastError: 'boom' }), sub('c')]
    const local = [sub('a', { name: 'Neuf', enabled: false, seen: [], lastChecked: 0 }), sub('n')]
    const out = mergeForSave(remote, local)
    expect(out.find((s) => s.id === 'a')).toMatchObject({ name: 'Neuf', enabled: false, seen: ['x'], lastChecked: 99, lastError: 'boom' })
    expect(out.map((s) => s.id).sort()).toEqual(['a', 'c', 'n'])
    expect(mergeForSave(remote, local, ['c', 'a']).map((s) => s.id)).toEqual(['n'])
  })
  it('lit un fichier partiel sans planter', () => {
    expect(parseSubscriptionsFile('{}').subscriptions).toEqual([])
    const f = parseSubscriptionsFile('{"subscriptions":[{"id":"abc","url":"https://a.io"},{"bad":1}]}')
    expect(f.subscriptions).toHaveLength(1)
    expect(f.subscriptions[0]).toMatchObject({ name: 'https://a.io', enabled: true, seen: [], lastError: null })
  })
  it('base64 UTF-8', () => {
    expect(base64ToUtf8(utf8ToBase64('héllo ✓'))).toBe('héllo ✓')
    expect(base64ToUtf8('aGk=\n')).toBe('hi')
  })
})
