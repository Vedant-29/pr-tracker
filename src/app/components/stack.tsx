import { Layers } from 'lucide-react'
import type { Pr } from '../../shared/types'
import { PrCard } from './pr-row'

/* A stack inside a repo group: bottom PR first (merge order), a rail down
   the left so the chain reads as one thing. */
export function Stack({ prs }: { prs: Pr[] }) {
  const ordered = [...prs].sort((a, b) => a.depth - b.depth)
  return (
    <div className="relative pl-5">
      <span aria-hidden className="absolute top-3 bottom-3 left-[6px] w-px bg-ring" />
      <p className="mb-1.5 -ml-5 flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
        <Layers className="size-3" strokeWidth={1.8} /> stack · {ordered.length} PRs
      </p>
      <div className="space-y-1.5">
        {ordered.map((p) => (
          <div key={p.id} className="relative">
            <span aria-hidden className="absolute top-[15px] -left-[17px] size-[7px] rounded-full bg-background ring-1 ring-ring" />
            <PrCard pr={p} />
          </div>
        ))}
      </div>
    </div>
  )
}
