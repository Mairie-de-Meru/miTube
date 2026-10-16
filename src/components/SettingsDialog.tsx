import { useEffect, useRef, useState } from 'react'
import { GitHubClient, detectRepo, parseRepo, tokenUrl } from '../lib/github'
import { parsePresets, stringifyPresets, type FormValues } from '../lib/form'
import { normalizeWorkerUrl } from '../lib/direct'
import { clearAllLocalData, type Settings, type StoredToken } from '../lib/settings'
import { useT } from '../i18n'
import { OptionFields } from './OptionFields'

export function SettingsDialog(p: {
  settings: Settings
  token: StoredToken
  notice: string
  onSave: (s: Settings, t: StoredToken) => void
  onClose: () => void
}) {
  const t = useT()
  const ref = useRef<HTMLDialogElement>(null)
  const [worker, setWorker] = useState(p.settings.workerUrl)
  const [repo, setRepo] = useState(p.settings.repo || detectRepo(location))
  const [token, setToken] = useState(p.token.token)
  const [remember, setRemember] = useState(p.token.remember)
  const [defaults, setDefaults] = useState<FormValues>(p.settings.defaults)
  const [presets, setPresets] = useState(stringifyPresets(p.settings.presets))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  const test = async () => {
    const r = parseRepo(repo)
    if (!r) return setMsg({ ok: false, text: t('err.repo') })
    if (!token.trim()) return setMsg({ ok: false, text: t('err.token') })
    setTesting(true)
    setMsg(null)
    try {
      const client = new GitHubClient(token.trim(), r)
      const info = await client.getRepo()
      await client.listRuns()
      setMsg({ ok: true, text: t('test.ok', { repo: info.full_name }) })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  const save = () => {
    const w = worker.trim() ? normalizeWorkerUrl(worker) : ''
    if (worker.trim() && !w) return setMsg({ ok: false, text: t('err.worker') })
    const r = repo.trim() ? parseRepo(repo) : null
    if (repo.trim() && !r) return setMsg({ ok: false, text: t('err.repo') })
    let parsed
    try {
      parsed = parsePresets(presets)
    } catch (e) {
      return setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    }
    p.onSave(
      { ...p.settings, workerUrl: w, repo: r ? `${r.owner}/${r.repo}` : '', defaults, presets: parsed },
      { token: token.trim(), remember },
    )
  }

  const wipe = () => {
    if (!window.confirm(t('confirm.clearData'))) return
    clearAllLocalData()
    location.reload()
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dlg-title"
      onClose={p.onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
    >
      <form method="dialog" className="dialog-body" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="dialog-head">
          <h2 id="dlg-title">{t('settings')}</h2>
          <button type="button" className="btn-close" aria-label={t('close')} onClick={() => ref.current?.close()}>×</button>
        </div>
        {p.notice && <div className="alert alert-warning" role="alert">{p.notice}</div>}

        <fieldset>
          <legend>{t('set.direct')}</legend>
          <div className="field">
            <label htmlFor="set-worker">{t('set.worker')}</label>
            <input id="set-worker" className="control" value={worker} placeholder="https://metube-pages-proxy.example.workers.dev" spellCheck={false} autoCapitalize="off" onChange={(e) => setWorker(e.target.value)} />
            <small className="hint">{t('set.worker.hint')}</small>
          </div>
        </fieldset>

        <fieldset>
          <legend>{t('set.github')}</legend>
          <div className="field">
            <label htmlFor="set-repo">{t('set.repo')}</label>
            <input id="set-repo" className="control" value={repo} placeholder="owner/repo" spellCheck={false} autoCapitalize="off" onChange={(e) => setRepo(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="set-token">{t('set.token')}</label>
            <input id="set-token" className="control" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} />
            <label className="check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> {t('set.remember')}
            </label>
          </div>
          <details className="howto">
            <summary>{t('set.howto')}</summary>
            <ol>
              <li>
                <a href={tokenUrl(parseRepo(repo)?.owner ?? '')} target="_blank" rel="noopener noreferrer">{t('set.howto.1')}</a>
              </li>
              <li>{t('set.howto.2')}</li>
              <li>{t('set.howto.3')}</li>
            </ol>
          </details>
          <p className="hint">{t('privacy')}</p>
          <button type="button" className="btn" disabled={testing} onClick={test}>{testing ? t('testing') : t('test')}</button>
          <div aria-live="polite">
            {msg && <div className={`alert ${msg.ok ? 'alert-success' : 'alert-danger'}`}>{msg.text}</div>}
          </div>
        </fieldset>

        <fieldset>
          <legend>{t('set.defaults')}</legend>
          <OptionFields form={defaults} defaults={defaults} onChange={setDefaults} />
        </fieldset>

        <fieldset>
          <legend>{t('set.presets')}</legend>
          <div className="field">
            <label htmlFor="set-presets">{t('set.presets.label')}</label>
            <textarea id="set-presets" className="control mono" rows={5} spellCheck={false} placeholder={'{\n  "my-preset": { "embed_subs": true }\n}'} value={presets} onChange={(e) => setPresets(e.target.value)} />
          </div>
        </fieldset>

        <div className="dialog-foot">
          <button type="button" className="btn btn-danger" onClick={wipe}>{t('set.clear')}</button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => ref.current?.close()}>{t('cancel')}</button>
          <button type="submit" className="btn btn-primary">{t('save')}</button>
        </div>
      </form>
    </dialog>
  )
}
