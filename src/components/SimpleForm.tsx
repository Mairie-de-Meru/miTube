import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { DEFAULT_FORM, parseUrls, type DownloadForm } from '../lib/payload'
import type { FormValues } from '../lib/form'
import { PUBLIC_MAX_URLS, SIMPLE_FORMATS, isYoutubeUrl, simpleFormatOf } from '../lib/simple'
import { useT, type Key } from '../i18n'

/** Formulaire du mode public : une adresse YouTube et un format (vidéo MP4 ou conversion audio MP3). */
export function SimpleForm(p: {
  defaults: FormValues
  busy: boolean
  onSubmit: (form: DownloadForm) => Promise<boolean>
}) {
  const t = useT()
  const [urls, setUrls] = useState('')
  const [formatId, setFormatId] = useState(simpleFormatOf(p.defaults).id)
  const [error, setError] = useState('')

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    const list = parseUrls(urls)
    if (list.length === 0) return setError(t('simple.err.empty'))
    if (list.length > PUBLIC_MAX_URLS) return setError(t('simple.err.many', { n: PUBLIC_MAX_URLS }))
    if (!list.every(isYoutubeUrl)) return setError(t('simple.err.url'))
    setError('')
    const f = SIMPLE_FORMATS.find((x) => x.id === formatId) ?? SIMPLE_FORMATS[0]
    const form: DownloadForm = { ...DEFAULT_FORM, urls: list.join('\n'), type: f.type, format: f.format, quality: f.quality }
    if (await p.onSubmit(form)) setUrls('')
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !urls.trim().includes('\n')) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <form className="card add-form" onSubmit={submit}>
      <div className="card-body">
        <div className="url-row">
          <label className="visually-hidden" htmlFor="url-input">{t('simple.url')}</label>
          <textarea
            id="url-input"
            className="control control-lg url-input"
            rows={1}
            placeholder={t('simple.url')}
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            onKeyDown={onKey}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <label className="visually-hidden" htmlFor="simple-format">{t('format')}</label>
          <select id="simple-format" className="control control-lg" value={formatId} onChange={(e) => setFormatId(e.target.value)}>
            {SIMPLE_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>{t(`simple.fmt.${f.id}` as Key)}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary btn-lg" disabled={p.busy}>
            {p.busy ? t('adding') : t('simple.go')}
          </button>
        </div>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <p className="hint">{t('simple.hint')}</p>
      </div>
    </form>
  )
}
