import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Contributions } from '../../shared/types'
import { useHasHover } from '../lib/hover'
import { usePersisted } from '../lib/persist'
import { Bone, Pill, Section } from './section'

/* A GitHub contribution graph, fed by GitHub's own calendar
   for whichever accounts are selected. Year pills, monochrome ramp,
   hover tooltip; plus a click pins the day's count in the footer, for
   anyone who'd rather not hover. */

type Day = { date: string; count: number; level: 0 | 1 | 2 | 3 | 4; future: boolean }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const LEVEL_CLASS = [
  'bg-muted',
  'bg-muted-foreground/25',
  'bg-muted-foreground/45',
  'bg-muted-foreground/70',
  'bg-muted-foreground',
]

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

/* Every day of the year, future ones included so the grid is always a full
   year wide, levelled by quartile of that year's non-zero days — how GitHub
   shades its own graph. */
function daysOf(year: number, counts: Record<string, number>): Day[] {
  const today = new Date().toISOString().slice(0, 10)
  const dates: string[] = []
  for (const d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) dates.push(d.toISOString().slice(0, 10))
  const nonZero = dates.map((d) => counts[d] ?? 0).filter((n) => n > 0).sort((a, b) => a - b)
  const q = (f: number) => nonZero[Math.min(nonZero.length - 1, Math.floor(nonZero.length * f))] ?? 0
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)]
  return dates.map((date) => {
    const count = counts[date] ?? 0
    const level = count === 0 ? 0 : count <= q1 ? 1 : count <= q2 ? 2 : count <= q3 ? 3 : 4
    return { date, count, level, future: date > today }
  })
}

function toWeeks(days: Day[]): (Day | null)[][] {
  if (days.length === 0) return []
  const weeks: (Day | null)[][] = []
  let week: (Day | null)[] = Array(new Date(days[0].date).getUTCDay()).fill(null)
  for (const day of days) {
    week.push(day)
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length) weeks.push([...week, ...Array(7 - week.length).fill(null)])
  return weeks
}

type Hovered = { day: Day; x: number; y: number }

export function ContributionGraph({ sources }: { sources: { login: string; data: Contributions }[] }) {
  const thisYear = new Date().getUTCFullYear()
  const { years, counts } = useMemo(() => {
    const ys = new Set<number>([thisYear])
    const counts: Record<string, number> = {}
    for (const s of sources) {
      for (const y of s.data.years) ys.add(y)
      for (const [d, n] of Object.entries(s.data.days)) counts[d] = (counts[d] ?? 0) + n
    }
    return { years: [...ys].sort((a, b) => b - a), counts }
  }, [sources, thisYear])

  const [storedYear, setYear] = usePersisted<number>('year', thisYear)
  const year = years.includes(storedYear) ? storedYear : thisYear
  const [hovered, setHovered] = useState<Hovered | null>(null)
  const [picked, setPicked] = useState<Day | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const hasHover = useHasHover()

  const days = useMemo(() => daysOf(year, counts), [year, counts])
  const weeks = useMemo(() => toWeeks(days), [days])
  const total = useMemo(() => days.reduce((n, d) => n + d.count, 0), [days])
  const cols = `repeat(${weeks.length}, minmax(0, 1fr))`

  /* Viewport coordinates, rendered through a portal: the grid is an
     overflow container, which would clip a tooltip on the top row. */
  function onCellEnter(day: Day, el: HTMLElement) {
    if (!hasHover) return
    const cell = el.getBoundingClientRect()
    setHovered({ day, x: cell.left + cell.width / 2, y: cell.top })
  }
  useEffect(() => {
    if (!hovered) return
    const clear = () => setHovered(null)
    window.addEventListener('scroll', clear, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', clear, { capture: true })
  }, [hovered])

  const n = (v: number) => new Intl.NumberFormat().format(v)

  return (
    <Section id="contributions" title="GitHub Contributions">
      <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {years.map((y) => (
          <Pill key={y} active={y === year} onClick={() => { setYear(y); setPicked(null); setHovered(null) }}>{y}</Pill>
        ))}
      </div>

      <div ref={gridRef} className="no-scrollbar relative overflow-x-auto overscroll-x-contain pb-1" onMouseLeave={() => setHovered(null)}>
        {/* Fluid: 53 equal columns fill whatever width the page has, and only
            below ~740px does it fall back to scrolling. */}
        <div className="min-w-[740px]">
          <div className="mb-1.5 grid h-3 gap-[3px]" style={{ gridTemplateColumns: cols }}>
            {weeks.map((week, i) => {
              const first = week.find(Boolean)
              const isNewMonth = first && (i === 0 ||
                new Date(first.date).getUTCMonth() !== new Date(weeks[i - 1].find(Boolean)?.date ?? first.date).getUTCMonth())
              return (
                <div key={i} className="relative">
                  {isNewMonth && <span className="absolute top-0 left-0 font-mono text-[10px] leading-none whitespace-nowrap text-muted-foreground">{MONTHS[new Date(first.date).getUTCMonth()]}</span>}
                </div>
              )
            })}
          </div>
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: cols }}>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day, di) => day ? (
                  <button
                    type="button"
                    key={di}
                    aria-label={`${day.count} contributions on ${dayFormatter.format(new Date(`${day.date}T00:00:00Z`))}`}
                    onMouseEnter={(e) => onCellEnter(day, e.currentTarget)}
                    onClick={() => setPicked((p) => (p?.date === day.date ? null : day))}
                    className={`aspect-square w-full rounded-[2px] ring-foreground/40 transition-[box-shadow] hover:ring-1 ${day.future ? 'bg-muted/50' : LEVEL_CLASS[day.level]} ${picked?.date === day.date ? 'ring-1 ring-foreground' : ''}`}
                  />
                ) : (
                  <div key={di} className="aspect-square w-full rounded-[2px] bg-transparent" />
                ))}
              </div>
            ))}
          </div>
        </div>

        {hovered && hasHover && createPortal(
          <div
            role="tooltip"
            style={{ left: hovered.x, top: hovered.y }}
            className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-[calc(100%+6px)] whitespace-nowrap rounded-md bg-accent px-2 py-1 font-mono text-[11px] text-foreground shadow-md"
          >
            {hovered.day.count} contribution{hovered.day.count === 1 ? '' : 's'} ·{' '}
            <span className="text-muted-foreground">{dayFormatter.format(new Date(`${hovered.day.date}T00:00:00Z`))}</span>
          </div>,
          document.body,
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[12px] text-muted-foreground">
        <span aria-live="polite">
          {picked ? (
            <>
              <span className="font-medium text-foreground">{n(picked.count)}</span> contribution{picked.count === 1 ? '' : 's'} on{' '}
              {dayFormatter.format(new Date(`${picked.date}T00:00:00Z`))}
              <button type="button" onClick={() => setPicked(null)} className="ml-2 underline underline-offset-4 hover:text-foreground">back</button>
            </>
          ) : (
            <>
              {n(total)} contributions in {year} on{' '}
              {sources.map((s, i) => (
                <span key={s.login}>
                  {i > 0 && ' and '}
                  <a href={`https://github.com/${s.login}`} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-4">{s.login}</a>
                </span>
              ))}
              .
            </>
          )}
        </span>
        <span className="flex items-center gap-1">
          Less
          {LEVEL_CLASS.map((cls) => <span key={cls} className={`size-[11px] rounded-[2px] ${cls}`} />)}
          More
        </span>
      </div>
      </div>
    </Section>
  )
}

export function ContributionsSkeleton() {
  return (
    <Section id="contributions" title="GitHub Contributions">
      <div className="space-y-4">
        <div className="flex gap-1.5">{[0, 1, 2, 3].map((i) => <Bone key={i} className="h-[22px] w-12 rounded-full" />)}</div>
        <div className="no-scrollbar overflow-x-auto pb-1">
          <div className="mt-[18px] grid min-w-[740px] gap-[3px]" style={{ gridTemplateColumns: 'repeat(53, minmax(0, 1fr))' }}>
            {Array.from({ length: 53 }, (_, w) => (
              <div key={w} className="flex flex-col gap-[3px]">
                {Array.from({ length: 7 }, (_, d) => <div key={d} className="aspect-square w-full animate-pulse rounded-[2px] bg-muted" />)}
              </div>
            ))}
          </div>
        </div>
        <Bone className="h-3.5 w-64" />
      </div>
    </Section>
  )
}
