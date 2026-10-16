import { useState, type FormEvent, type KeyboardEvent } from 'react'
import type { DownloadForm } from '../lib/payload'
import type { FormValues, Presets } from '../lib/form'
import { useT } from '../i18n'
import { OptionFields } from './OptionFields'

export function AddForm(p: {
  defaults: FormValues
  presets: Presets
  busy: boolean
  onSubmit: (form: DownloadForm) => Promise<boolean>
}) {
  const t = useT()
  const [form, setForm] = useState<DownloadForm>({ ...p.defaults, urls: '' })
  const [open, setOpen] = useState(false)

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (await p.onSubmit(form)) setForm((f) => ({ ...f, urls: '' }))
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !form.urls.trim().includes('\n')) {
      // Entrée envoie ; Maj+Entrée ajoute une ligne pour coller plusieurs URL.
      e.preventDefault()
      void submit()
    }
  }
  const patch = (x: Partial<DownloadForm>) => setForm((f) => ({ ...f, ...x }))

  return (
    <form className="card add-form" onSubmit={submit}>
      <div className="card-body">
        <div className="url-row">
          <label className="visually-hidden" htmlFor="url-input">{t('url.label')}</label>
          <textarea
            id="url-input"
            className="control control-lg url-input"
            rows={1}
            placeholder={t('url.placeholder')}
            value={form.urls}
            onChange={(e) => patch({ urls: e.target.value })}
            onKeyDown={onKey}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" className="btn btn-primary btn-lg" disabled={p.busy}>
            {p.busy ? t('adding') : t('add')}
          </button>
        </div>
        <p className="hint">{t('url.hint')}</p>
        <OptionFields form={form} defaults={p.defaults} onChange={setForm} />
        <button
          type="button"
          className="btn btn-link"
          aria-expanded={open}
          aria-controls="advanced"
          onClick={() => setOpen(!open)}
        >
          {open ? '▾' : '▸'} {t('advanced')}
        </button>
        {open && (
          <div id="advanced" className="advanced">
            <div className="option-grid">
              <div className="field">
                <label htmlFor="adv-limit">{t('adv.limit')}</label>
                <input
                  id="adv-limit"
                  className="control"
                  type="number"
                  min={0}
                  max={10000}
                  value={form.playlistLimit}
                  onChange={(e) => patch({ playlistLimit: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
                />
                <small className="hint">{t('adv.limit.hint')}</small>
              </div>
              <div className="field field-check">
                <label>
                  <input type="checkbox" checked={form.splitChapters} onChange={(e) => patch({ splitChapters: e.target.checked })} />{' '}
                  {t('adv.chapters')}
                </label>
              </div>
              <div className="field">
                <label htmlFor="adv-template">{t('adv.template')}</label>
                <input
                  id="adv-template"
                  className="control"
                  value={form.outputTemplate}
                  placeholder="%(title)s.%(ext)s"
                  spellCheck={false}
                  onChange={(e) => patch({ outputTemplate: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="adv-preset">{t('adv.preset')}</label>
                <select id="adv-preset" className="control" value={form.preset} onChange={(e) => patch({ preset: e.target.value })}>
                  <option value="">{t('none')}</option>
                  {Object.keys(p.presets).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="adv-invidious">{t('adv.invidious')}</label>
              <input
                id="adv-invidious"
                className="control"
                value={form.invidiousInstances}
                placeholder="https://invidious.f5.si"
                spellCheck={false}
                onChange={(e) => patch({ invidiousInstances: e.target.value })}
              />
              <p className="hint">{t('adv.invidiousHint')}</p>
            </div>
            <div className="field">
              <label htmlFor="adv-json">{t('adv.overrides')}</label>
              <textarea
                id="adv-json"
                className="control mono"
                rows={4}
                spellCheck={false}
                placeholder='{"embed_subs": true}'
                value={form.ytdlOptions}
                onChange={(e) => patch({ ytdlOptions: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>
    </form>
  )
}
