import { useCallback, useState } from 'react'

/* useState that survives a reload. Every control on the page goes through
   this so the view you left is the view you come back to. */
export function usePersisted<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`prt:${key}`)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  const set = useCallback((v: T) => {
    setValue(v)
    try {
      localStorage.setItem(`prt:${key}`, JSON.stringify(v))
    } catch {
      /* private mode etc. — in-memory state still works */
    }
  }, [key])
  return [value, set]
}
