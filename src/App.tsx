import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GitHubClient, GitHubError, parseRepo } from './lib/github'
import { buildPayload, type DownloadForm } from './lib/payload'
import { normalizeForm } from './lib/form'
import type { Job } from './lib/jobs'
import { loadSettings, loadToken, saveSettings, saveToken, type Settings, type StoredToken, type Theme } from './lib/settings'
import { I18nContext, makeT } from './i18n'
import { useJobs } from './hooks/useJobs'
import { Navbar } from './components/Navbar'
import { DirectPanel } from './components/DirectPanel'
import { Welcome } from './components/Welcome'
import { AddForm } from './components/AddForm'
import { Subscriptions } from './components/Subscriptions'
import { JobList } from './components/JobList'
import { SettingsDialog } from './components/SettingsDialog'
import { Toasts, type Toast } from './components/Toasts'
import type { RowActions } from './components/JobRow'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [stored, setStored] = useState<StoredToken>(loadToken)
  const [dialog, setDialog] = useState<{ notice: string } | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [tab, setTab] = useState<'downloads' | 'subs'>('downloads')
  const [busy, setBusy] = useState(false)
  const [formVersion, setFormVersion] = useState(0)
  const branches = useRef(new Map<string, string>())
  const toastId = useRef(0)

  const lang = settings.lang
  const i18n = useMemo(() => ({ lang, t: makeT(lang) }), [lang])
  const { t } = i18n

  const client = useMemo(() => {
    const ref = parseRepo(settings.repo)
    return stored.token && ref ? new GitHubClient(stored.token, ref) : null
  }, [stored.token, settings.repo])
  const { jobs, error, loading, refresh, addLocal, removeLocal, loadMeta } = useJobs(client)

  // Thème : data-theme sur <html> (auto suit prefers-color-scheme) et langue du document.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = settings.theme === 'auto' ? (mq.matches ? 'dark' : 'light') : settings.theme
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings.theme])
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = ++toastId.current
    setToasts((x) => [...x.slice(-3), { id, kind, text }])
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), kind === 'error' ? 10000 : 5000)
  }, [])

  const submit = useCallback(
    async (form: DownloadForm): Promise<boolean> => {
      if (!client) {
        setDialog({ notice: t('err.needSetup') })
        return false
      }
      setBusy(true)
      try {
        const payload = buildPayload(form, settings.presets)
        const { urls, type, format, quality, codec } = payload
        addLocal({ jobId: payload.jobId, createdAt: Date.now(), request: { urls, type, format, quality, codec } })
        try {
          const key = settings.repo
          let branch = branches.current.get(key)
          if (!branch) {
            branch = (await client.getRepo()).default_branch
            branches.current.set(key, branch)
          }
          await client.dispatch(payload, branch)
        } catch (e) {
          removeLocal([payload.jobId])
          throw e
        }
        const { urls: _urls, ...values } = form
        void _urls
        update({ defaults: values })
        refresh(true)
        toast('success', t('toast.sent', { n: urls.length }))
        return true
      } catch (e) {
        toast('error', message(e))
        return false
      } finally {
        setBusy(false)
      }
    },
    [client, settings.presets, settings.repo, addLocal, removeLocal, update, refresh, toast, t],
  )

  const actions: RowActions = useMemo(
    () => ({
      client,
      onError: (m) => toast('error', m),
      onCancel: async (job: Job) => {
        if (!client || !job.runId) return
        try {
          await client.cancelRun(job.runId)
          toast('info', t('toast.cancelled'))
        } catch (e) {
          toast('error', message(e))
        }
        refresh(true)
      },
      onRetry: (job: Job) => {
        if (!job.request) return
        const { urls, type, format, quality, codec } = job.request
        const form = normalizeForm({ ...settings.defaults, type, format, quality, codec })
        void submit({ ...form, urls: urls.join('\n') })
      },
      onDelete: async (list: Job[]) => {
        if (!client || list.length === 0) return
        if (!window.confirm(t('confirm.delete', { n: list.length }))) return
        const gone = async (p: Promise<void>) => {
          try {
            await p
          } catch (e) {
            if (!(e instanceof GitHubError && e.status === 404)) throw e
          }
        }
        let failed = 0
        for (const job of list) {
          try {
            for (const a of [job.artifact, job.metaArtifact]) if (a && !a.expired) await gone(client.deleteArtifact(a.id))
            if (job.runId) await gone(client.deleteRun(job.runId))
          } catch (e) {
            failed++
            toast('error', message(e))
          }
        }
        removeLocal(list.map((j) => j.id))
        if (failed < list.length) toast('success', t('toast.deleted', { n: list.length - failed }))
        refresh()
      },
    }),
    [client, settings.defaults, submit, removeLocal, refresh, toast, t],
  )

  const saveDialog = (s: Settings, tk: StoredToken) => {
    saveToken(tk)
    setStored(tk)
    update({ workerUrl: s.workerUrl, repo: s.repo, defaults: s.defaults, presets: s.presets })
    setFormVersion((v) => v + 1)
    setDialog(null)
    toast('success', t('toast.saved'))
  }

  const status = error instanceof GitHubError ? error.status : 0
  const openSettings = () => setDialog({ notice: '' })

  return (
    <I18nContext value={i18n}>
      <Navbar
        theme={settings.theme}
        lang={lang}
        onTheme={(theme: Theme) => update({ theme })}
        onLang={(l) => update({ lang: l })}
        onSettings={openSettings}
      />
      <main className="container main">
        <div className="mode-switch" role="group">
          {(['direct', 'actions'] as const).map((m) => (
            <button key={m} type="button" className={`btn btn-sm${settings.mode === m ? ' btn-primary' : ''}`} aria-pressed={settings.mode === m} onClick={() => update({ mode: m })}>
              {t(`mode.${m}` as 'mode.direct')}
            </button>
          ))}
        </div>
        {settings.mode === 'direct' ? (
          <DirectPanel workerUrl={settings.workerUrl} onOpenSettings={openSettings} />
        ) : !client ? (
          <Welcome onStart={openSettings} />
        ) : (
          <>
            {error != null && (
              <div className="alert alert-danger" role="alert">
                <span>{[401, 403, 404].includes(status) ? t(`banner.${status}` as 'banner.401') : message(error)}</span>{' '}
                <button type="button" className="btn btn-sm" onClick={openSettings}>{t('openSettings')}</button>
              </div>
            )}
            <AddForm key={formVersion} defaults={settings.defaults} presets={settings.presets} busy={busy} onSubmit={submit} />
            <div className="refresh-bar">
              <div className="tabs" role="group">
                {(['downloads', 'subs'] as const).map((k) => (
                  <button key={k} type="button" className={`btn btn-sm${tab === k ? ' btn-primary' : ''}`} aria-pressed={tab === k} onClick={() => setTab(k)}>
                    {t(`tab.${k}`)}
                  </button>
                ))}
              </div>
              {tab === 'downloads' && (
                <button type="button" className="btn btn-sm" disabled={loading} onClick={() => refresh()}>
                  {loading ? t('refreshing') : t('refresh')}
                </button>
              )}
            </div>
            {tab === 'downloads' ? (
              <JobList jobs={jobs} actions={actions} loadMeta={loadMeta} />
            ) : (
              <Subscriptions client={client} defaults={settings.defaults} presets={settings.presets} onToast={toast} />
            )}
          </>
        )}
      </main>
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((x) => x.filter((y) => y.id !== id))} />
      {dialog && (
        <SettingsDialog
          settings={settings}
          token={stored}
          notice={dialog.notice}
          onSave={saveDialog}
          onClose={() => setDialog(null)}
        />
      )}
    </I18nContext>
  )
}
