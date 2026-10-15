import { useState, type FormEvent } from 'react'
import { GitHubError, type GitHubClient } from '../lib/github'
import { buildPayload, parseUrls, FormError, type DownloadForm } from '../lib/payload'
import type { FormValues, Presets } from '../lib/form'
import {
  addSubscription, createSubscription, removeSubscription, requestFromPayload, updateSubscription,
} from '../lib/subscriptions'
import { formatDate } from '../lib/format'
import { useSubscriptions } from '../hooks/useSubscriptions'
import { useI18n } from '../i18n'
import { OptionFields } from './OptionFields'

export function Subscriptions(p: {
  client: GitHubClient
  defaults: FormValues
  presets: Presets
  onToast: (kind: 'error' | 'success' | 'info', text: string) => void
}) {
  const { t, lang } = useI18n()
  const { subs, loading, error, reload, save } = useSubscriptions(p.client)
  const [form, setForm] = useState<DownloadForm>({ ...p.defaults, urls: '' })
  const [name, setName] = useState('')
  const [hours, setHours] = useState(12)
  const [scan, setScan] = useState(20)
  const [busy, setBusy] = useState(false)

  const fail = (e: unknown) => {
    const perm = e instanceof GitHubError && [401, 403, 404].includes(e.status)
    p.onToast('error', perm ? t('subs.perm') : e instanceof Error ? e.message : String(e))
  }

  const add = async (ev: FormEvent) => {
    ev.preventDefault()
    setBusy(true)
    try {
      if (parseUrls(form.urls).length !== 1) throw new FormError(t('subs.oneUrl'))
      const payload = buildPayload(form, p.presets)
      const sub = createSubscription({ url: payload.urls[0], name, intervalHours: hours, scan, request: requestFromPayload(payload) })
      await save(addSubscription(subs, sub), [], `Add subscription ${sub.id}`)
      setForm((f) => ({ ...f, urls: '' }))
      setName('')
      p.onToast('success', t('subs.added'))
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (id: string, enabled: boolean) => {
    try {
      await save(updateSubscription(subs, id, { enabled }), [], `${enabled ? 'Enable' : 'Disable'} subscription ${id}`)
    } catch (e) {
      fail(e)
    }
  }
  const remove = async (id: string) => {
    if (!window.confirm(t('subs.confirmDelete'))) return
    try {
      await save(removeSubscription(subs, id), [id], `Remove subscription ${id}`)
    } catch (e) {
      fail(e)
    }
  }

  const perm = error instanceof GitHubError && [401, 403, 404].includes(error.status)
  return (
    <>
      <section className="card" aria-labelledby="h-subs-add">
        <div className="card-header"><h2 id="h-subs-add">{t('subs.add')}</h2></div>
        <form className="card-body" onSubmit={add}>
          <p className="hint">{t('subs.help')}</p>
          <div className="option-grid">
            <div className="field">
              <label htmlFor="sub-url">{t('subs.url')}</label>
              <input id="sub-url" className="control" type="url" required value={form.urls} spellCheck={false} onChange={(e) => setForm({ ...form, urls: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="sub-name">{t('subs.name')}</label>
              <input id="sub-name" className="control" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="sub-hours">{t('subs.interval')}</label>
              <input id="sub-hours" className="control" type="number" min={1} max={168} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="sub-scan">{t('subs.scan')}</label>
              <input id="sub-scan" className="control" type="number" min={1} max={100} value={scan} onChange={(e) => setScan(Number(e.target.value))} />
            </div>
          </div>
          <OptionFields form={form} defaults={p.defaults} onChange={setForm} />
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('adding') : t('subs.addBtn')}</button>
        </form>
      </section>

      <section className="card" aria-labelledby="h-subs">
        <div className="card-header toolbar">
          <h2 id="h-subs">{t('subs.title')}</h2>
          <button type="button" className="btn btn-sm" disabled={loading} onClick={() => void reload()}>
            {loading ? t('refreshing') : t('refresh')}
          </button>
        </div>
        {perm && <div className="alert alert-danger" role="alert">{t('subs.perm')}</div>}
        {error != null && !perm && <div className="alert alert-danger" role="alert">{error instanceof Error ? error.message : String(error)}</div>}
        {subs.length === 0 ? (
          <p className="empty">{t('subs.empty')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table table-stack">
              <thead>
                <tr>
                  <th>{t('subs.enabled')}</th><th>{t('col.title')}</th><th>{t('subs.every')}</th><th>{t('subs.last')}</th><th>{t('col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-check">
                      <input type="checkbox" checked={s.enabled} aria-label={t('subs.enabled')} onChange={(e) => void toggle(s.id, e.target.checked)} />
                    </td>
                    <td className="cell-title">
                      <div className="title">{s.name}</div>
                      <div className="sub">{s.url}</div>
                      <div className="sub">{[s.request.type, s.request.format, s.request.quality].join(' · ')}</div>
                    </td>
                    <td className="cell-meta">{s.intervalHours} h</td>
                    <td className="cell-title">
                      <div className="sub">{s.lastChecked ? formatDate(s.lastChecked * 1000, lang) : t('subs.never')}</div>
                      {s.lastError && <div className="sub text-danger">{s.lastError.slice(0, 300)}</div>}
                    </td>
                    <td className="cell-actions">
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => void remove(s.id)}>{t('delete')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
