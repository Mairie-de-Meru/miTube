import { useMemo, useState } from 'react'
import { isActive, type Job } from '../lib/jobs'
import { useT } from '../i18n'
import { ActiveRow, DoneRow, type RowActions } from './JobRow'

const PAGE = 20

export function JobList(p: { jobs: Job[]; actions: RowActions; loadMeta: (j: Job) => void }) {
  const t = useT()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [shown, setShown] = useState(PAGE)
  const active = useMemo(() => p.jobs.filter(isActive), [p.jobs])
  const finished = useMemo(() => p.jobs.filter((j) => !isActive(j)), [p.jobs])
  const visible = finished.slice(0, shown)
  const picked = finished.filter((j) => selected.has(j.id))
  const allOn = visible.length > 0 && visible.every((j) => selected.has(j.id))

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })
  const toggleAll = (on: boolean) => setSelected(on ? new Set(visible.map((j) => j.id)) : new Set())
  const clear = (statuses: Job['status'][]) => p.actions.onDelete(finished.filter((j) => statuses.includes(j.status)))
  const hasFailed = finished.some((j) => j.status === 'failed')
  const hasOk = finished.some((j) => j.status !== 'failed')

  return (
    <>
      <section className="card" aria-labelledby="h-active">
        <div className="card-header"><h2 id="h-active">{t('downloading.title')}</h2></div>
        {active.length === 0 ? (
          <p className="empty">{t('empty.active')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table table-stack">
              <thead className="visually-hidden">
                <tr><th>{t('col.title')}</th><th>{t('col.actions')}</th></tr>
              </thead>
              <tbody>
                {active.map((j) => (
                  <ActiveRow key={j.id} job={j} actions={p.actions} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="h-done">
        <div className="card-header toolbar">
          <h2 id="h-done">{t('completed.title')}</h2>
          <div className="toolbar-actions">
            <button type="button" className="btn btn-sm btn-danger" disabled={picked.length === 0} onClick={() => p.actions.onDelete(picked)}>
              {t('deleteSelected')}
            </button>
            <button type="button" className="btn btn-sm" disabled={!hasOk} onClick={() => clear(['done', 'expired', 'cancelled'])}>
              {t('clearCompleted')}
            </button>
            <button type="button" className="btn btn-sm" disabled={!hasFailed} onClick={() => clear(['failed'])}>
              {t('clearFailed')}
            </button>
          </div>
        </div>
        {finished.length === 0 ? (
          <p className="empty">{t('empty.done')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table table-stack">
              <thead>
                <tr>
                  <th className="cell-check">
                    <input type="checkbox" checked={allOn} onChange={(e) => toggleAll(e.target.checked)} aria-label={t('selectAll')} />
                  </th>
                  <th>{t('col.title')}</th>
                  <th>{t('col.size')}</th>
                  <th>{t('col.date')}</th>
                  <th>{t('col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((j) => (
                  <DoneRow
                    key={j.id}
                    job={j}
                    actions={p.actions}
                    loadMeta={p.loadMeta}
                    selected={selected.has(j.id)}
                    onSelect={(on) => toggle(j.id, on)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {finished.length > shown && (
          <div className="card-footer">
            <button type="button" className="btn btn-sm" onClick={() => setShown(shown + PAGE)}>
              {t('showMore', { n: finished.length - shown })}
            </button>
          </div>
        )}
      </section>
    </>
  )
}
