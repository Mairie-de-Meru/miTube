import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DirectError,
  downloadFormat,
  fetchWorkerInfo,
  fileNameFor,
  planDownload,
  saveBlob,
  type DirectQuality,
  type DirectType,
} from '../lib/direct'
import { mux } from '../lib/mux'

export type DirectStatus = 'queued' | 'info' | 'video' | 'audio' | 'muxing' | 'done' | 'error'

export interface DirectItem {
  id: string
  input: string
  type: DirectType
  quality: DirectQuality
  status: DirectStatus
  /** Progression de l'étape en cours, 0..1. */
  progress: number
  title?: string
  author?: string
  thumbnail?: string
  fileName?: string
  size?: number
  /** Code d'erreur du Worker ou de la lib, avec son détail éventuel. */
  error?: { code: string; reason?: string }
}

let counter = 0

export function useDirect(base: string, onDone?: (item: DirectItem) => void) {
  const [items, setItems] = useState<DirectItem[]>([])
  const blobs = useRef(new Map<string, Blob>())
  const queue = useRef<string[]>([])
  const running = useRef(false)
  const aborts = useRef(new Map<string, AbortController>())
  const itemsRef = useRef<DirectItem[]>([])
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
    itemsRef.current = items
  })

  const patch = useCallback((id: string, p: Partial<DirectItem>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...p } : it)))
  }, [])

  const process = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id)
      if (!item) return
      const ctrl = new AbortController()
      aborts.current.set(id, ctrl)
      try {
        patch(id, { status: 'info', progress: 0 })
        const info = await fetchWorkerInfo(base, item.input, ctrl.signal)
        patch(id, { title: info.title, author: info.author, thumbnail: info.thumbnail })
        const plan = planDownload(info, item.type, item.quality)
        let blob: Blob
        if (plan.video) {
          patch(id, { status: 'video', progress: 0 })
          const video = await downloadFormat(base, plan.video, (p) => patch(id, { progress: p }), ctrl.signal)
          if (plan.audio) {
            patch(id, { status: 'audio', progress: 0 })
            const audio = await downloadFormat(base, plan.audio, (p) => patch(id, { progress: p }), ctrl.signal)
            patch(id, { status: 'muxing', progress: 0 })
            blob = await mux(video, audio, plan.ext, (p) => patch(id, { progress: p }))
          } else {
            blob = video
          }
        } else {
          patch(id, { status: 'audio', progress: 0 })
          blob = await downloadFormat(base, plan.audio!, (p) => patch(id, { progress: p }), ctrl.signal)
        }
        const fileName = fileNameFor(info.title, plan.ext)
        blobs.current.set(id, blob)
        patch(id, { status: 'done', progress: 1, fileName, size: blob.size })
        saveBlob(blob, fileName)
        onDoneRef.current?.({ ...item, status: 'done', fileName, size: blob.size, title: info.title })
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          setItems((list) => list.filter((i) => i.id !== id))
        } else if (e instanceof DirectError) {
          patch(id, { status: 'error', error: { code: e.message, reason: e.reason } })
        } else {
          patch(id, { status: 'error', error: { code: 'NETWORK', reason: e instanceof Error ? e.message : String(e) } })
        }
      } finally {
        aborts.current.delete(id)
      }
    },
    [base, patch],
  )

  const pump = useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      for (let id = queue.current.shift(); id; id = queue.current.shift()) await process(id)
    } finally {
      running.current = false
    }
  }, [process])

  const add = useCallback(
    (inputs: string[], type: DirectType, quality: DirectQuality) => {
      const created: DirectItem[] = inputs.map((input) => ({
        id: `d${Date.now().toString(36)}${++counter}`,
        input,
        type,
        quality,
        status: 'queued',
        progress: 0,
      }))
      itemsRef.current = [...itemsRef.current, ...created]
      setItems(itemsRef.current)
      queue.current.push(...created.map((c) => c.id))
      void pump()
    },
    [pump],
  )

  const remove = useCallback((id: string) => {
    aborts.current.get(id)?.abort()
    queue.current = queue.current.filter((q) => q !== id)
    blobs.current.delete(id)
    setItems((list) => list.filter((i) => i.id !== id))
  }, [])

  const retry = useCallback(
    (id: string) => {
      const it = itemsRef.current.find((i) => i.id === id)
      if (!it) return
      patch(id, { status: 'queued', progress: 0, error: undefined })
      queue.current.push(id)
      void pump()
    },
    [patch, pump],
  )

  const save = useCallback((id: string) => {
    const blob = blobs.current.get(id)
    const it = itemsRef.current.find((i) => i.id === id)
    if (blob && it?.fileName) saveBlob(blob, it.fileName)
  }, [])

  useEffect(() => {
    const map = aborts.current
    return () => map.forEach((c) => c.abort())
  }, [])

  return { items, add, remove, retry, save }
}
