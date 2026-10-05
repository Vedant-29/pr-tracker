import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme'
import { useShortcut } from '../lib/shortcuts'

export function ThemeToggle() {
  const [theme, toggle] = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  useShortcut('d', toggle)
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme (d)`}
      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {theme === 'dark' ? <Moon className="size-4" strokeWidth={1.7} /> : <Sun className="size-4" strokeWidth={1.7} />}
    </button>
  )
}
