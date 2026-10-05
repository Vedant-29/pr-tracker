import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

/* A small dropdown in the site's own clothes — native <select> can't be
   styled to match and looked out of place. */
export function Select<T extends string>({ value, options, onChange, label, className = '' }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-md bg-muted px-2.5 font-mono text-[11.5px] text-foreground transition-colors hover:bg-accent"
      >
        <span className="truncate">{current?.label}</span>
        <ChevronDown className={`size-3 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2} />
      </button>
      {open && (
        <ul role="listbox" className="absolute left-0 z-30 mt-1 max-h-64 min-w-[180px] overflow-auto rounded-md bg-muted p-1 shadow-lg">
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-[11.5px] transition-colors hover:bg-accent ${o.value === value ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                <Check className={`size-3 shrink-0 ${o.value === value ? 'opacity-100' : 'opacity-0'}`} strokeWidth={2.2} />
                <span className="truncate">{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
