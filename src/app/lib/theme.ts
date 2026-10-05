import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>('dark')
  useEffect(() => {
    setTheme(localStorage.getItem('theme') === 'light' ? 'light' : 'dark')
  }, [])
  const toggle = () =>
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('theme', next)
      document.documentElement.classList.toggle('dark', next === 'dark')
      return next
    })
  return [theme, toggle]
}
