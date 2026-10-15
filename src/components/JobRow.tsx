import { useEffect, useRef, useState } from 'react'
import type { GitHubClient, JobStep } from '../lib/github'
import { jobTitle, type Job } from '../lib/jobs'
import { unzipBlob } from '../lib/files'
import { formatBytes, formatDate } from '../lib/format'
import { useI18n } from '../i18n'

export interface RowActions {
  client: GitHubClient | null
  onCancel: (job: Job) => void
  onDelete: (jobs: Job[]) => void
  onRetry: (job: Job) => void
  onError: (message: string) => void
}

const jobKind = (job: Job): string => {
  const r = job.request
  return r ? [r.type, r.format, r.quality].filter(Boolean).join(' · ') : ''
}

export function ActiveRow({ job, actions }: { job: Job; actions: RowActions }) {
  const { t } = useI18n()
  const [steps, setSteps] = useState<JobStep[]>([])
  const { client } = actions
  const running = job.status === 'running'
  useEffect(() => {
    if (!client || !job.runId || !running) return
    const runId = job.runId
    let stop = false
    const load = () => client.listSteps(runId).then((s) => !stop && setSteps(s), () => undefined)
    void load()
    const timer = setInterval(load, 8000)
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [client, job.runId, running])

  const total = steps.length
  const done = steps.filter((s) => s.status === 'completed').length
  const current = steps.find((s) => s.status === 'in_progress')
  const pct = running && total > 0 ? Math.round((done / total) * 100) : null
  const label = t(`status.${job.status}`)
  return (
    <tr>
      <td className="cell-title">
        <div className="title">{jobTitle(job)}</div>
        <div className="sub">{jobKind(job)}</div>
        <div
          className={`progress${pct === null ? ' progress-indeterminate' : ''}`}
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct ?? undefined}
        >
          <div className="progress-bar" style={pct === null ? undefined : { width: `${Math.max(pct, 5)}%` }} />
        </div>
        <div className="sub">
          {label}
          {current ? ` — ${current.name}` : ''}
        </div>
      </td>
      <td className="cell-actions">
        {job.runUrl && (
          <a className="btn btn-sm" href={job.runUrl} target="_blank" rel="noopener noreferrer">{t('runlog')}</a>
        )}
        {job.runId && (
          <button type="button" className="btn btn-sm btn-danger" onClick={() => actions.onCancel(job)}>{t('cancel')}</button>
        )}
      </td>
    </tr>
  )
}

interface Extracted {
  name: string
  size: number
  url: string
}

export function DoneRow(p: {
  job: Job
  actions: RowActions
  selected: boolean
  onSelect: (on: boolean) => void
  loadMeta: (j: Job) => void
}) {
  const { job, actions, loadMeta } = p
  const { t, lang } = useI18n()
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState<Extracted[] | null>(null)
  const [zipUrl, setZipUrl] = useState('')
  const urls = useRef<string[]>([])

  useEffect(() => {
    loadMeta(job)
  }, [loadMeta, job])
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const download = async () => {
    if (!actions.client || !job.artifact) return
    setBusy(true)
    try {
      const blob = await actions.client.downloadArtifact(job.artifact.id)
      const extracted = await unzipBlob(blob)
      urls.current.forEach((u) => URL.revokeObjectURL(u))
      const zip = URL.createObjectURL(blob)
      const list = extracted.map((f) => ({
        name: f.name,
        size: f.data.byteLength,
        url: URL.createObjectURL(new Blob([f.data as BlobPart])),
      }))
      urls.current = [zip, ...list.map((f) => f.url)]
      setZipUrl(zip)
      setFiles(list)
    } catch (e) {
      actions.onError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const failed = job.status === 'failed'
  const error = job.meta?.error || job.meta?.items.find((i) => !i.ok)?.error
  const first = job.meta?.items[0]
  const extra = first?.isPlaylist ? ` (${t('entries', { n: first.entries ?? 0 })})` : ''
  return (
    <tr className={failed ? 'row-failed' : undefined}>
      <td className="cell-check">
        <input type="checkbox" checked={p.selected} onChange={(e) => p.onSelect(e.target.checked)} aria-label={t('select')} />
      </td>
      <td className="cell-title">
        <div className="title">{jobTitle(job)}{extra}</div>
        <div className="sub">
          <span className={`badge badge-${job.status}`}>{t(`status.${job.status}`)}</span> {jobKind(job)}
        </div>
        {failed && error && <div className="sub text-danger">{error.slice(0, 300)}</div>}
        {files && (
          <ul className="files">
            {files.map((f) => (
              <li key={f.url}>
                <a href={f.url} download={f.name}>{f.name}</a> <span className="muted">({formatBytes(f.size)})</span>
              </li>
            ))}
            <li>
              <a href={zipUrl} download={`metube-${job.id}.zip`}>{t('downloadAll')}</a>
            </li>
          </ul>
        )}
      </td>
      <td className="cell-meta">{job.artifact ? formatBytes(job.artifact.size_in_bytes) : ''}</td>
      <td className="cell-meta">{formatDate(job.createdAt, lang)}</td>
      <td className="cell-actions">
        {job.status === 'done' && job.artifact && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={download}>
            {busy ? t('downloading') : t('download')}
          </button>
        )}
        {job.request && (
          <button type="button" className="btn btn-sm" onClick={() => actions.onRetry(job)}>{t('retry')}</button>
        )}
        {job.runUrl && (
          <a className="btn btn-sm" href={job.runUrl} target="_blank" rel="noopener noreferrer">{t('runlog')}</a>
        )}
        <button type="button" className="btn btn-sm btn-danger" onClick={() => actions.onDelete([job])}>{t('delete')}</button>
      </td>
    </tr>
  )
}
