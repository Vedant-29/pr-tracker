import { useCallback, useEffect, useRef, useState } from 'react'
import type { Payload } from '../../shared/types'

type Status = 'loading' | 'ready' | 'error' | 'unauthed'

/* Live-ish without a socket: poll every 30s while the tab is visible, and
   again the moment it becomes visible. The request carries the last ETag so
   an unchanged payload is a 304 with no body — the worker does the real
   GitHub check in the background when it sees the cache getting old. */
const POLL_MS = 30_000

export function usePrs() {
  const [data, setData] = useState<Payload | null>(null)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const etag = useRef<string | null>(null)

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true)
    try {
      const headers: Record<string, string> = {}
      if (!force && etag.current) headers['if-none-match'] = etag.current
      const res = await fetch(force ? '/api/prs?refresh' : '/api/prs', { headers })
      if (res.status === 401) { setStatus('unauthed'); return }
      if (res.status === 304) { setCheckedAt(res.headers.get('x-checked-at')); return }
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
      const payload = (await res.json()) as Payload
      etag.current = res.headers.get('etag')
      setData(payload)
      setCheckedAt(payload.checkedAt ?? payload.fetchedAt)
      setStatus('ready')
      setError(null)
    } catch (e) {
      setError((e as Error).message)
      setStatus('error')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void load() }
    const id = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [load])

  return { data, checkedAt, status, error, refreshing, reload: load, setStatus }
}

export async function login(password: string): Promise<boolean> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  return res.ok
}
