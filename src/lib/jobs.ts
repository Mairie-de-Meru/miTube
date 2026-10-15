// Fusionne runs, artefacts et métadonnées locales en une liste de téléchargements
// (file d'attente / terminés / échecs), comme les trois zones de MeTube.
import type { Artifact, WorkflowRun } from './github'
import type { Payload } from './payload'

export type JobStatus = 'sending' | 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'expired'

export interface LocalJob {
  jobId: string
  createdAt: number
  request: Pick<Payload, 'urls' | 'type' | 'format' | 'quality' | 'codec'>
}

export interface ResultMeta {
  jobId: string
  ok: boolean
  error: string | null
  request?: LocalJob['request']
  items: { url: string; title?: string | null; isPlaylist?: boolean; entries?: number; ok: boolean; error?: string }[]
  files: { name: string; size: number }[]
}

export interface Job {
  id: string
  status: JobStatus
  createdAt: number
  runId?: number
  runUrl?: string
  request?: LocalJob['request']
  /** Artefact contenant les fichiers (absent tant que le job n'est pas fini). */
  artifact?: Artifact
  metaArtifact?: Artifact
  meta?: ResultMeta
}

const TITLE_RE = /^metube ([A-Za-z0-9_-]{4,64})$/
/** Délai pendant lequel un envoi sans run visible est considéré « en cours d'envoi ». */
export const SENDING_GRACE_MS = 120_000

export function jobIdOfRun(run: WorkflowRun): string | null {
  return TITLE_RE.exec(run.display_title)?.[1] ?? null
}

export function statusOfRun(run: WorkflowRun, artifact?: Artifact): JobStatus {
  if (run.status !== 'completed') return run.status === 'in_progress' ? 'running' : 'queued'
  if (run.conclusion === 'cancelled') return 'cancelled'
  if (artifact?.expired) return 'expired'
  if (run.conclusion === 'success') return artifact ? 'done' : 'expired'
  // Échec partiel : des fichiers existent quand même.
  return artifact && artifact.size_in_bytes > 0 ? 'done' : 'failed'
}

export function buildJobs(
  runs: WorkflowRun[],
  artifacts: Artifact[],
  local: LocalJob[],
  metas: Record<string, ResultMeta> = {},
  now: number = Date.now(),
): Job[] {
  const byName = new Map(artifacts.map((a) => [a.name, a]))
  const localById = new Map(local.map((l) => [l.jobId, l]))
  const jobs = new Map<string, Job>()

  for (const run of runs) {
    const id = jobIdOfRun(run)
    if (!id) continue
    const artifact = byName.get(`metube-${id}`)
    const l = localById.get(id)
    const meta = metas[id]
    jobs.set(id, {
      id,
      status: statusOfRun(run, artifact),
      createdAt: Date.parse(run.created_at),
      runId: run.id,
      runUrl: run.html_url,
      request: meta?.request ?? l?.request,
      artifact,
      metaArtifact: byName.get(`metube-${id}-meta`),
      meta,
    })
  }
  for (const l of local) {
    if (jobs.has(l.jobId)) continue
    if (now - l.createdAt > SENDING_GRACE_MS) continue // jamais apparu : abandonné
    jobs.set(l.jobId, { id: l.jobId, status: 'sending', createdAt: l.createdAt, request: l.request })
  }
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt)
}

export const isActive = (j: Job) => j.status === 'sending' || j.status === 'queued' || j.status === 'running'

export const jobTitle = (job: Job): string => {
  const first = job.meta?.items[0]
  return first?.title || first?.url || job.request?.urls[0] || job.id
}
