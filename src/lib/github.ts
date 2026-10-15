// Client minimal de l'API REST GitHub, utilisé directement depuis le navigateur
// (api.github.com autorise CORS). Le jeton ne quitte jamais le navigateur.
import type { Payload } from './payload'
import { parseSubscriptionsFile, type SubscriptionsFile } from './subscriptions'

export const API = 'https://api.github.com'
export const WORKFLOW_FILE = 'download.yml'
export const DATA_BRANCH = 'metube-data'
export const SUBS_PATH = 'data/subscriptions.json'

export function utf8ToBase64(text: string): string {
  let bin = ''
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b)
  return btoa(bin)
}
export function base64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export class GitHubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface RepoRef {
  owner: string
  repo: string
}

export function parseRepo(text: string): RepoRef | null {
  const m = text.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '')
    .match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/)
  return m ? { owner: m[1], repo: m[2] } : null
}

/** Déduit « user/repo » de l'adresse quand le site est servi par GitHub Pages. */
export function detectRepo(loc: Pick<Location, 'hostname' | 'pathname'>): string {
  const m = loc.hostname.match(/^([A-Za-z0-9-]+)\.github\.io$/)
  if (!m) return ''
  const first = loc.pathname.split('/').filter(Boolean)[0]
  return `${m[1]}/${first ?? `${m[1]}.github.io`}`
}

export interface WorkflowRun {
  id: number
  display_title: string
  status: 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending'
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'neutral' | 'action_required' | null
  created_at: string
  updated_at: string
  html_url: string
}

export interface Artifact {
  id: number
  name: string
  size_in_bytes: number
  expired: boolean
  created_at: string
  expires_at: string | null
  workflow_run?: { id: number } | null
}

export interface JobStep {
  name: string
  status: string
  conclusion: string | null
}

export class GitHubClient {
  private token: string
  private ref: RepoRef
  private fetchImpl: typeof fetch

  constructor(token: string, ref: RepoRef, fetchImpl: typeof fetch = (...a) => fetch(...a)) {
    this.token = token
    this.ref = ref
    this.fetchImpl = fetchImpl
  }

  private get base() {
    return `${API}/repos/${this.ref.owner}/${this.ref.repo}`
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${this.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...extra,
    }
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.fetchImpl(path.startsWith('http') ? path : `${this.base}${path}`, {
      ...init,
      headers: this.headers(init.headers as Record<string, string> | undefined),
    })
    if (!res.ok) {
      let detail = ''
      try {
        detail = ((await res.json()) as { message?: string }).message ?? ''
      } catch {
        /* corps non JSON */
      }
      throw new GitHubError(res.status, explain(res.status, detail))
    }
    return res
  }

  async getRepo(): Promise<{ default_branch: string; full_name: string; private: boolean }> {
    return (await this.request('')).json()
  }

  /** Lance le workflow ; renvoie quand GitHub a accepté la demande (HTTP 204). */
  async dispatch(payload: Payload, branch: string): Promise<void> {
    await this.request(`/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({
        ref: branch,
        inputs: { job_id: payload.jobId, payload: JSON.stringify(payload) },
      }),
    })
  }

  async listRuns(): Promise<WorkflowRun[]> {
    const res = await this.request(
      `/actions/workflows/${WORKFLOW_FILE}/runs?event=workflow_dispatch&per_page=100`,
    )
    return ((await res.json()) as { workflow_runs: WorkflowRun[] }).workflow_runs
  }

  async listArtifacts(): Promise<Artifact[]> {
    const res = await this.request('/actions/artifacts?per_page=100')
    return ((await res.json()) as { artifacts: Artifact[] }).artifacts
  }

  async listSteps(runId: number): Promise<JobStep[]> {
    const res = await this.request(`/actions/runs/${runId}/jobs`)
    const jobs = ((await res.json()) as { jobs: { steps?: JobStep[] }[] }).jobs
    return jobs[0]?.steps ?? []
  }

  async cancelRun(runId: number): Promise<void> {
    await this.request(`/actions/runs/${runId}/cancel`, { method: 'POST' })
  }

  async deleteRun(runId: number): Promise<void> {
    await this.request(`/actions/runs/${runId}`, { method: 'DELETE' })
  }

  async deleteArtifact(id: number): Promise<void> {
    await this.request(`/actions/artifacts/${id}`, { method: 'DELETE' })
  }

  /** Lit data/subscriptions.json sur la branche de données ; null si le fichier ou la branche n'existe pas. */
  async getSubscriptionsFile(): Promise<{ data: SubscriptionsFile; sha: string } | null> {
    try {
      const res = await this.request(`/contents/${SUBS_PATH}?ref=${DATA_BRANCH}`)
      const j = (await res.json()) as { content: string; sha: string }
      return { data: parseSubscriptionsFile(base64ToUtf8(j.content)), sha: j.sha }
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return null
      throw e
    }
  }

  async saveSubscriptionsFile(data: SubscriptionsFile, sha: string | null, message: string): Promise<string> {
    const res = await this.request(`/contents/${SUBS_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: utf8ToBase64(`${JSON.stringify(data, null, 2)}\n`),
        branch: DATA_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    })
    return ((await res.json()) as { content: { sha: string } }).content.sha
  }

  /** Crée la branche de données (depuis la branche par défaut) si elle n'existe pas. */
  async ensureDataBranch(): Promise<void> {
    try {
      await this.request(`/git/ref/heads/${DATA_BRANCH}`)
      return
    } catch (e) {
      if (!(e instanceof GitHubError && e.status === 404)) throw e
    }
    const { default_branch } = await this.getRepo()
    const ref = (await (await this.request(`/git/ref/heads/${encodeURIComponent(default_branch)}`)).json()) as {
      object: { sha: string }
    }
    await this.request('/git/refs', {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${DATA_BRANCH}`, sha: ref.object.sha }),
    })
  }

  /** Télécharge l'archive d'un artefact (l'API répond par une redirection signée). */
  async downloadArtifact(id: number): Promise<Blob> {
    const res = await this.request(`/actions/artifacts/${id}/zip`)
    return res.blob()
  }
}

function explain(status: number, detail: string): string {
  const hint: Record<number, string> = {
    401: 'Token rejected (expired or wrong).',
    403: 'Forbidden: the token lacks the "Actions: read and write" permission, or rate limit reached.',
    404: 'Not found: check the repository name and that the token can access it.',
    422: 'Rejected by GitHub (is download.yml present on the default branch?).',
  }
  return `${hint[status] ?? `GitHub error ${status}.`}${detail ? ` (${detail})` : ''}`
}
