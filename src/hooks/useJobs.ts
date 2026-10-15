import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Artifact, GitHubClient, WorkflowRun } from '../lib/github'
import { buildJobs, isActive, type Job, type LocalJob, type ResultMeta } from '../lib/jobs'
import { readMeta } from '../lib/files'
import { loadLocalJobs, saveLocalJobs } from '../lib/settings'

const FAST_MS = 5_000
const SLOW_MS = 30_000
const ERROR_MS = 60_000
const BOOST_MS = 60_000

export function useJobs(client: GitHubClient | null) {
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [local, setLocal] = useState<LocalJob[]>(loadLocalJobs)
  const [metas, setMetas] = useState<Record<string, ResultMeta>>({})
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)
  const boostUntil = useRef(0)
  const activeRef = useRef(false)
  const errorRef = useRef(false)
  const tried = useRef(new Set<string>())
  const queue = useRef<Promise<void>>(Promise.resolve())

  const jobs = useMemo(() => buildJobs(runs, artifacts, local, metas), [runs, artifacts, local, metas])
  const hasActive = jobs.some(isActive)
  useEffect(() => {
    activeRef.current = hasActive
  }, [hasActive])

  useEffect(() => {
    if (!client) return
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      if (!document.hidden) {
        setLoading(true)
        try {
          const [r, a] = await Promise.all([client.listRuns(), client.listArtifacts()])
          if (stop) return
          setRuns(r)
          setArtifacts(a)
          setError(null)
          errorRef.current = false
        } catch (e) {
          if (stop) return
          setError(e)
          errorRef.current = true
        } finally {
          if (!stop) setLoading(false)
        }
      }
      if (stop) return
      const fast = activeRef.current || Date.now() < boostUntil.current
      timer = setTimeout(tick, errorRef.current ? ERROR_MS : fast ? FAST_MS : SLOW_MS)
    }
    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer)
        void tick()
      }
    }
    void tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stop = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [client, nonce])

  /** Relance immédiatement une actualisation ; `boost` garde le rythme rapide un moment (après un envoi). */
  const refresh = useCallback((boost = false) => {
    if (boost) boostUntil.current = Date.now() + BOOST_MS
    setNonce((n) => n + 1)
  }, [])

  const addLocal = useCallback((job: LocalJob) => {
    setLocal((cur) => {
      const next = [...cur.filter((j) => j.jobId !== job.jobId), job]
      saveLocalJobs(next)
      return next
    })
  }, [])

  const removeLocal = useCallback((ids: string[]) => {
    setLocal((cur) => {
      const next = cur.filter((j) => !ids.includes(j.jobId))
      saveLocalJobs(next)
      return next
    })
  }, [])

  /** Charge result.json d'un job fini (une requête à la fois, mémoire seulement, échec silencieux). */
  const loadMeta = useCallback(
    (job: Job) => {
      if (!client || !job.metaArtifact || job.metaArtifact.expired || job.meta || tried.current.has(job.id)) return
      tried.current.add(job.id)
      const id = job.metaArtifact.id
      queue.current = queue.current.then(async () => {
        try {
          const meta = await readMeta(await client.downloadArtifact(id))
          setMetas((m) => ({ ...m, [job.id]: meta }))
        } catch {
          /* CORS, expiré ou illisible : l'URL locale est affichée à la place */
        }
      })
    },
    [client],
  )

  return { jobs, error, loading, refresh, addLocal, removeLocal, loadMeta }
}
