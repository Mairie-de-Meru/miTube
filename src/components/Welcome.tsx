import { useState } from 'react'
import { GitHubClient, parseRepo, tokenUrl } from '../lib/github'
import type { StoredToken } from '../lib/settings'
import { useT } from '../i18n'

/** Première connexion : dépôt (détecté) + jeton à coller une seule fois, avec test avant d'enregistrer. */
export function Welcome(p: {
  repo: string
  token: StoredToken
  onConnect: (repo: string, token: StoredToken) => void
  onAdvanced: () => void
}) {
  const t = useT()
  const [repo, setRepo] = useState(p.repo)
  const [token, setToken] = useState(p.token.token)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = parseRepo(repo)

  const connect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ref) return setError(t('err.repo'))
    if (!token.trim()) return setError(t('err.token'))
    setBusy(true)
    setError('')
    try {
      const client = new GitHubClient(token.trim(), ref)
      await client.getRepo()
      await client.listRuns()
      p.onConnect(`${ref.owner}/${ref.repo}`, { token: token.trim(), remember })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card welcome">
      <div className="card-body">
        <h1>{t('welcome.title')}</h1>
        <p>{t('welcome.intro')}</p>
        <ol className="steps">
          <li>
            <a href={tokenUrl(ref?.owner ?? '')} target="_blank" rel="noopener noreferrer">{t('welcome.step1')}</a>
          </li>
          <li>{t('welcome.step2')}</li>
          <li>{t('welcome.step3')}</li>
        </ol>
        <form onSubmit={connect}>
          <div className="field">
            <label htmlFor="wel-token">{t('set.token')}</label>
            <input id="wel-token" className="control" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} />
            <label className="check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> {t('set.remember')}
            </label>
          </div>
          {!p.repo && (
            <div className="field">
              <label htmlFor="wel-repo">{t('set.repo')}</label>
              <input id="wel-repo" className="control" value={repo} placeholder="owner/repo" spellCheck={false} autoCapitalize="off" onChange={(e) => setRepo(e.target.value)} />
            </div>
          )}
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <p className="muted">{t('privacy')}</p>
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? t('testing') : t('welcome.start')}</button>{' '}
          <button type="button" className="btn btn-link" onClick={p.onAdvanced}>{t('welcome.advanced')}</button>
        </form>
      </div>
    </section>
  )
}
