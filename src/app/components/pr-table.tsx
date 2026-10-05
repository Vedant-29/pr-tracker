import { ArrowUpRight } from 'lucide-react'
import type { Pr } from '../../shared/types'
import { dateFull, repoShort } from '../lib/format'
import { StateIcon } from './pr-row'

/* Every PR, one row each. Filtering and sorting happen upstream. The row
   opens the PR on GitHub; the title is a real link so middle-click and
   copy-link work. */
export function PrTable({ rows, total }: { rows: Pr[]; total: number }) {
  return (
    <div className="mt-3 space-y-2">
      <div className="overflow-x-auto overscroll-x-contain">
        {/* Rows are rounded pills rather than ruled lines: border-spacing
            gives each its own gap, first/last cells carry the radius. */}
        <table className="w-full min-w-[560px] border-separate border-spacing-y-1 font-mono text-[12px]">
          <thead>
            <tr className="text-left text-[11px] text-muted-foreground">
              <th className="px-3 pb-1 font-normal">date</th>
              <th className="px-3 pb-1 font-normal">repo</th>
              <th className="px-3 pb-1 font-normal">pull request</th>
              <th className="px-3 pb-1 font-normal">status</th>
              <th className="w-8 pb-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                onClick={() => window.open(p.url, '_blank', 'noopener,noreferrer')}
                className="group cursor-pointer bg-muted/50 transition-colors hover:bg-muted [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg"
              >
                <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">{dateFull(p.createdAt)}</td>
                <td className="max-w-[180px] truncate px-3 py-2.5 text-muted-foreground" title={p.repo}>{repoShort(p.repo)}</td>
                <td className="px-3 py-2.5">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="outline-none focus-visible:underline">
                    <span className="text-muted-foreground">#{p.number}</span>{' '}
                    <span className="font-sans text-[13px] text-foreground">{p.title}</span>
                  </a>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground"><StateIcon state={p.state} className="size-3.5" />{p.state}</span>
                </td>
                <td className="py-2.5 pr-2 text-right">
                  <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    <ArrowUpRight className="size-3.5" strokeWidth={2} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-6 font-mono text-[12px] text-muted-foreground">No PRs match.</p>}
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">{rows.length} of {total}</p>
    </div>
  )
}
