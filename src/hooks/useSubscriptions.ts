import { useCallback, useEffect, useRef, useState } from 'react'
import { GitHubError, type GitHubClient } from '../lib/github'
import { mergeForSave, type Subscription } from '../lib/subscriptions'

/** Charge et modifie data/subscriptions.json (relecture avant écriture, sha, une nouvelle tentative sur 409/422). */
export function useSubscriptions(client: GitHubClient | null) {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const ready = useRef(false)

  const load = useCallback(async () => {
    if (!client) return
    setLoading(true)
    try {
      const f = await client.getSubscriptionsFile()
      setSubs(f?.data.subscriptions ?? [])
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    ready.current = false
    void Promise.resolve().then(load)
  }, [load])

  /** Applique l'état voulu `local` (et les suppressions) sur la version distante fraîche. */
  const save = useCallback(
    async (local: Subscription[], removed: string[], message: string): Promise<void> => {
      if (!client) return
      if (!ready.current) {
        await client.ensureDataBranch()
        ready.current = true
      }
      for (let attempt = 0; ; attempt++) {
        const remote = await client.getSubscriptionsFile()
        const merged = mergeForSave(remote?.data.subscriptions ?? [], local, removed)
        try {
          await client.saveSubscriptionsFile({ subscriptions: merged }, remote?.sha ?? null, message)
          setSubs(merged)
          return
        } catch (e) {
          if (attempt === 0 && e instanceof GitHubError && (e.status === 409 || e.status === 422)) continue
          throw e
        }
      }
    },
    [client],
  )

  return { subs, loading, error, reload: load, save }
}
