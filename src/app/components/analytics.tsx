import { useMemo, useState } from 'react'
import type { Pr } from '../../shared/types'
import { monthLabel, repoShort } from '../lib/format'
import { Bone, Card, Section } from './section'

/* Two small single-series charts, monochrome like the contribution graph.
   Bars are thin with a rounded far end, a 2px gap, hover tooltips, and only
   the peak and the latest month labelled directly. */

function lastMonths(n: number): string[] {
  const now = new Date()
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    out.push(d.toISOString().slice(0, 7))
  }
  return out
}

function PerMonth({ prs, onPick }: { prs: Pr[]; onPick: () => void }) {
  const months = useMemo(() => lastMonths(12), [])
  const counts = useMemo(() => {
    const c: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]))
    for (const p of prs) {
      const m = p.createdAt.slice(0, 7)
      if (m in c) c[m]++
    }
    return c
  }, [prs, months])
  const max = Math.max(1, ...months.map((m) => counts[m]))
  const peak = months.reduce((a, b) => (counts[b] > counts[a] ? b : a), months[0])
  const latest = months[months.length - 1]
  const [hover, setHover] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-[88px] flex-1 items-end gap-[2px]">
        {months.map((m) => {
          const v = counts[m]
          const label = m === peak || m === latest || hover === m
          return (
            <button
              type="button"
              key={m}
              onClick={onPick}
              className="group relative flex h-full flex-1 flex-col justify-end"
              onMouseEnter={() => setHover(m)}
              onMouseLeave={() => setHover(null)}
              title={`${v} PR${v === 1 ? '' : 's'} opened in ${monthLabel(m)} ${m.slice(0, 4)} — show all`}
            >
              {label && v > 0 && (
                <span className={`mb-1 text-center font-mono text-[10px] tabular-nums ${hover === m ? 'text-foreground' : 'text-muted-foreground'}`}>{v}</span>
              )}
              <div
                className={`w-full rounded-t-[4px] transition-colors ${hover === m ? 'bg-foreground' : v > 0 ? 'bg-muted-foreground/70' : 'bg-accent'}`}
                style={{ height: v > 0 ? `${Math.max(4, (v / max) * 100)}%` : '2px' }}
              />
            </button>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-[2px]">
        {months.map((m) => (
          <span key={m} className="flex-1 text-center font-mono text-[10px] text-muted-foreground">
            {monthLabel(m).slice(0, 1)}
            <span className="hidden sm:inline">{monthLabel(m).slice(1)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function PerRepo({ prs, onPick }: { prs: Pr[]; onPick: (repo: string) => void }) {
  const rows = useMemo(() => {
    const by = new Map<string, { total: number; merged: number; open: number }>()
    for (const p of prs) {
      const r = by.get(p.repo) ?? { total: 0, merged: 0, open: 0 }
      r.total++
      if (p.state === 'merged') r.merged++
      if (p.state === 'open' || p.state === 'draft') r.open++
      by.set(p.repo, r)
    }
    return [...by.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [prs])
  const max = Math.max(1, ...rows.map(([, r]) => r.total))
  const [hover, setHover] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      {rows.map(([repo, r]) => (
        <button
          type="button"
          key={repo}
          onClick={() => onPick(repo)}
          className="grid w-full grid-cols-[minmax(0,150px)_1fr_auto] items-center gap-2.5 text-left font-mono text-[11px]"
          onMouseEnter={() => setHover(repo)}
          onMouseLeave={() => setHover(null)}
          title={`${repo}: ${r.total} PRs, ${r.merged} merged, ${r.open} open — filter the list`}
        >
          <span className={`truncate ${hover === repo ? 'text-foreground' : 'text-muted-foreground'}`}>{repoShort(repo)}</span>
          <div className="h-2 rounded-r-[4px] bg-accent/70">
            <div className={`h-full rounded-r-[4px] transition-colors ${hover === repo ? 'bg-foreground' : 'bg-muted-foreground/70'}`} style={{ width: `${(r.total / max) * 100}%` }} />
          </div>
          <span className="text-right text-muted-foreground tabular-nums">
            <span className="text-foreground">{r.total}</span>
            <span className="ml-1.5 hidden opacity-70 lg:inline">{r.merged} merged{r.open ? ` · ${r.open} open` : ''}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

/* Two cards, one row: repos first, then the month series. */
export function Analytics({ prs, onRepo, onMonth }: { prs: Pr[]; onRepo: (repo: string) => void; onMonth: () => void }) {
  return (
    <Section id="analytics" title="Analytics">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <p className="mb-3 font-mono text-[11px] text-muted-foreground">PRs per repo · all time</p>
          <PerRepo prs={prs} onPick={onRepo} />
        </Card>
        <Card className="flex flex-col">
          <p className="mb-3 font-mono text-[11px] text-muted-foreground">PRs opened per month · last 12 months</p>
          <div className="flex-1"><PerMonth prs={prs} onPick={onMonth} /></div>
        </Card>
      </div>
    </Section>
  )
}

export function AnalyticsSkeleton() {
  return (
    <Section id="analytics" title="Analytics">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <Bone className="mb-3 h-3 w-36 bg-accent" />
          <div className="space-y-2.5">{[0, 1, 2, 3, 4, 5].map((i) => <Bone key={i} className="h-2.5 w-full bg-accent" />)}</div>
        </Card>
        <Card>
          <Bone className="mb-3 h-3 w-48 bg-accent" />
          <div className="flex h-[88px] items-end gap-[2px]">
            {[30, 45, 20, 60, 35, 80, 50, 25, 70, 40, 90, 55].map((h, i) => <Bone key={i} className="flex-1 rounded-t-[4px] rounded-b-none bg-accent" style={{ height: `${h}%` }} />)}
          </div>
        </Card>
      </div>
    </Section>
  )
}
