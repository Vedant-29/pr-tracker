import type { Pr } from '../../shared/types'
import { Bone, Card } from './section'

const ORDER = ['total', 'merged', 'open', 'closed', 'repos'] as const

/* Each tile is a shortcut to the matching tab. */
export function Stats({ prs, onPick }: { prs: Pr[]; onPick: (k: (typeof ORDER)[number]) => void }) {
  const n = {
    total: prs.length,
    merged: prs.filter((p) => p.state === 'merged').length,
    open: prs.filter((p) => p.state === 'open' || p.state === 'draft').length,
    closed: prs.filter((p) => p.state === 'closed').length,
    repos: new Set(prs.map((p) => p.repo)).size,
  }
  return (
    <Card>
      <dl className="flex flex-wrap gap-x-10 gap-y-3">
        {ORDER.map((k) => (
          <button key={k} type="button" onClick={() => onPick(k)} title={k === 'repos' ? 'Show all pull requests' : `Show ${k === 'total' ? 'all' : k} pull requests`}
            className="group -m-1.5 rounded-md p-1.5 text-left transition-colors hover:bg-accent/60">
            <dd className="font-mono text-[18px] leading-none font-medium tracking-tight text-foreground tabular-nums">{n[k]}</dd>
            <dt className="mt-1 font-mono text-[11px] text-muted-foreground group-hover:text-foreground">{k}</dt>
          </button>
        ))}
      </dl>
    </Card>
  )
}

export function StatsSkeleton() {
  return (
    <Card>
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        {ORDER.map((k) => (
          <div key={k}><Bone className="h-[18px] w-12 bg-accent" /><Bone className="mt-1.5 h-3 w-10 bg-accent" /></div>
        ))}
      </div>
    </Card>
  )
}
