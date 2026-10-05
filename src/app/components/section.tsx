import type { ReactNode } from 'react'

/* Pixel-face heading, content below. Hierarchy comes from the content
   sitting in a card (Overview, Analytics) or from its own shape (the
   contribution grid, the PR list) — no rules. */
export function Section({ id, title, children, aside, className = '' }: { id: string; title: string; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mt-8 ${className}`} aria-labelledby={`${id}-heading`}>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={`${id}-heading`} className="font-pixel text-[15px] text-muted-foreground">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}

/* Flat fill, no ring. The key hint is plain text. */
export function Pill({ active, onClick, children, title, hint }: { active: boolean; onClick: () => void; children: ReactNode; title?: string; hint?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11.5px] whitespace-nowrap transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
      {hint && <span className={`hidden text-[10px] sm:inline ${active ? 'opacity-50' : 'opacity-40'}`}>{hint}</span>}
    </button>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg bg-muted/50 p-4 ${className}`}>{children}</div>
}

/* Loading placeholders. Same shapes as the real thing so nothing jumps. */
export function Bone({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden style={style} className={`animate-pulse rounded-md bg-muted ${className}`} />
}
