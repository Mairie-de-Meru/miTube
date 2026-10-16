import { useState } from 'react'
import { DIRECT_QUALITIES, type DirectQuality, type DirectType } from '../lib/direct'
import { formatBytes } from '../lib/format'
import { useDirect, type DirectItem } from '../hooks/useDirect'
import { useT, type Key } from '../i18n'

function describeError(t: ReturnType<typeof useT>, e: NonNullable<DirectItem['error']>): string {
  const reason = e.reason ?? ''
  if (/not a bot|sign in/i.test(reason) || e.code === 'LOGIN_REQUIRED') return t('direct.err.bot')
  if (e.code === 'INVALID_URL') return t('direct.err.url')
  if (e.code === 'FORBIDDEN_ORIGIN') return t('direct.err.origin')
  if (e.code === 'NETWORK') return t('direct.err.network', { reason })
  return reason ? `${e.code}: ${reason}` : e.code
}

export function DirectPanel(p: { workerUrl: string; onOpenSettings: () => void }) {
  const t = useT()
  const { items, add, remove, retry, save } = useDirect(p.workerUrl)
  const [urls, setUrls] = useState('')
  const [type, setType] = useState<DirectType>('video')
  const [quality, setQuality] = useState<DirectQuality>('best')

  if (!p.workerUrl) {
    return (
      <section className="card welcome">
        <div className="card-body">
          <h1>{t('direct.title')}</h1>
          <p>{t('direct.noWorker')}</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={p.onOpenSettings}>{t('openSettings')}</button>
        </div>
      </section>
    )
  }

  const submit = () => {
    const list = urls.split(/\s+/).map((s) => s.trim()).filter(Boolean)
    if (list.length === 0) return
    add(list, type, quality)
    setUrls('')
  }

  return (
    <>
      <form
        className="card add-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="card-body">
          <div className="url-row">
          <label className="visually-hidden" htmlFor="direct-urls">{t('direct.urls')}</label>
          <textarea
            id="direct-urls"
            className="control control-lg url-input"
            rows={1}
            value={urls}
            placeholder={t('direct.placeholder')}
            spellCheck={false}
            onChange={(e) => setUrls(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <button type="submit" className="btn btn-primary btn-lg" disabled={!urls.trim()}>{t('direct.download')}</button>
          </div>
          <div className="option-grid">
            <div className="field">
              <label htmlFor="direct-type">{t('type')}</label>
              <select id="direct-type" className="control" value={type} onChange={(e) => setType(e.target.value as DirectType)}>
                <option value="video">{t('direct.type.video')}</option>
                <option value="audio">{t('direct.type.audio')}</option>
              </select>
            </div>
            {type === 'video' && (
              <div className="field">
                <label htmlFor="direct-quality">{t('quality')}</label>
                <select id="direct-quality" className="control" value={quality} onChange={(e) => setQuality(e.target.value as DirectQuality)}>
                  {DIRECT_QUALITIES.map((q) => (
                    <option key={q} value={q}>{q === 'best' ? t('direct.best') : `${q}p`}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="hint">{t('direct.hint')}</p>
        </div>
      </form>

      <ul className="direct-list" aria-live="polite">
        {items.map((it) => (
          <li key={it.id} className="card">
            <div className="card-body direct-row">
              {it.thumbnail && <img className="direct-thumb" src={it.thumbnail} alt="" width={96} height={54} loading="lazy" referrerPolicy="no-referrer" />}
              <div className="direct-main">
                <div className="title">{it.title ?? it.input}</div>
                <div className="sub">
                  {it.status === 'done' && it.size != null
                    ? `${it.fileName} · ${formatBytes(it.size)}`
                    : it.status === 'error'
                      ? ''
                      : `${t(`direct.status.${it.status}` as Key)}${it.status === 'queued' || it.status === 'info' ? '' : ` ${Math.round(it.progress * 100)} %`}`}
                </div>
                {it.status === 'error' && it.error && <div className="alert alert-danger" role="alert">{describeError(t, it.error)}</div>}
                {['video', 'audio', 'muxing'].includes(it.status) && (
                  <div className="progress"><div className="progress-bar" style={{ width: `${Math.max(it.progress * 100, 3)}%` }} /></div>
                )}
              </div>
              <div className="cell-actions">
                {it.status === 'done' && <button type="button" className="btn btn-sm" onClick={() => save(it.id)}>{t('direct.save')}</button>}
                {it.status === 'error' && <button type="button" className="btn btn-sm" onClick={() => retry(it.id)}>{t('retry')}</button>}
                <button type="button" className="btn btn-sm" onClick={() => remove(it.id)}>
                  {['done', 'error'].includes(it.status) ? t('direct.remove') : t('cancel')}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
