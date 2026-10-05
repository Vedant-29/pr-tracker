import { AlertTriangle, ArrowUpRight, Check, CircleDot, GitBranch, MessageSquare, X } from 'lucide-react'
import type { Pr, PrState } from '../../shared/types'
import { age, ageLong, compact, dateShort } from '../lib/format'
import { PrClosedIcon, PrDraftIcon, PrMergedIcon, PrOpenIcon } from './icons'
import { Bone } from './section'

export function StateIcon({ state, className = 'size-4' }: { state: PrState; className?: string }) {
  const cls = `${className} shrink-0`
  switch (state) {
    case 'open': return <PrOpenIcon className={`${cls} text-ok`} />
    case 'draft': return <PrDraftIcon className={`${cls} text-muted-foreground`} />
    case 'merged': return <PrMergedIcon className={`${cls} text-info`} />
    case 'closed': return <PrClosedIcon className={`${cls} text-bad`} />
  }
}

/* GitHub's label colour, tinted for the surface: a light wash behind, the
   hue pulled toward the foreground for legible text in both themes. */
export function Label({ name, color }: { name: string; color: string }) {
  const c = `#${color}`
  return (
    <span
      className="inline-flex h-[18px] items-center rounded-full px-1.5 font-mono text-[10px] leading-none whitespace-nowrap"
      style={{
        background: `color-mix(in oklab, ${c} 22%, transparent)`,
        color: `color-mix(in oklab, ${c} 70%, var(--foreground))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${c} 35%, transparent)`,
      }}
    >
      {name}
    </span>
  )
}

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted'
const TONE: Record<Tone, string> = {
  ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', info: 'text-info', muted: 'text-muted-foreground',
}
function Signal({ tone, title, children }: { tone: Tone; title?: string; children: React.ReactNode }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap font-mono text-[11px] ${TONE[tone]}`}>
      {children}
    </span>
  )
}

/* Blockers first, then the routine. Check counts are the real numbers. */
export function Signals(pr: {
  mergeable: Pr['mergeable']; behindBy?: number | null; base: string
  checks?: Pr['checks']; checkCounts?: Pr['checkCounts']
  review: Pr['review']; reviewers: string[]; approvedBy?: string[]; autoMerge?: boolean
}) {
  const out: React.ReactNode[] = []
  if (pr.mergeable === 'conflicting') {
    out.push(<Signal key="conf" tone="bad" title="Merge conflicts with base — rebase needed"><AlertTriangle className="size-3" strokeWidth={2} />conflicts</Signal>)
  } else if (pr.behindBy && pr.behindBy > 0) {
    out.push(<Signal key="behind" tone="warn" title={`Head is ${pr.behindBy} commit${pr.behindBy === 1 ? '' : 's'} behind ${pr.base}`}><GitBranch className="size-3" strokeWidth={2} />{pr.behindBy} behind</Signal>)
  }
  const cc = pr.checkCounts ?? { total: 0, failed: 0, pending: 0 }
  if (pr.checks === 'failure') out.push(<Signal key="ci" tone="bad" title={`${cc.failed} of ${cc.total} checks failed`}><X className="size-3" strokeWidth={2.2} />{cc.failed}/{cc.total} checks</Signal>)
  else if (pr.checks === 'pending') out.push(<Signal key="ci" tone="warn" title={`${cc.pending} of ${cc.total} checks still running`}><CircleDot className="size-3" strokeWidth={2} />{cc.pending}/{cc.total} running</Signal>)
  else if (pr.checks === 'success') out.push(<Signal key="ci" tone="ok" title={`All ${cc.total} checks passed`}><Check className="size-3" strokeWidth={2.2} />{cc.total} check{cc.total === 1 ? '' : 's'}</Signal>)

  if (pr.review === 'changes_requested') out.push(<Signal key="rv" tone="bad">changes requested</Signal>)
  else if (pr.review === 'approved') out.push(<Signal key="rv" tone="ok" title={pr.approvedBy?.length ? `Approved by ${pr.approvedBy.join(', ')}` : undefined}>approved</Signal>)
  else if (pr.review === 'review_required') out.push(<Signal key="rv" tone="muted">{pr.reviewers.length ? `waiting on ${pr.reviewers.slice(0, 2).join(', ')}${pr.reviewers.length > 2 ? ` +${pr.reviewers.length - 2}` : ''}` : 'needs review'}</Signal>)
  if (pr.autoMerge) out.push(<Signal key="am" tone="info">auto-merge</Signal>)

  if (!out.length) return null
  return <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">{out}</span>
}

/* One PR is one flat card, two lines: title, then meta and signals on a
   single mono line that wraps only when it has to. The whole card is a
   link to the PR on GitHub; the corner arrow just says so. */
export function PrCard({ pr, showRepo, showAuthor }: { pr: Pr; showRepo?: boolean; showAuthor?: boolean }) {
  const live = pr.state === 'open' || pr.state === 'draft'
  const when = pr.mergedAt ?? pr.closedAt ?? pr.createdAt
  const whenLabel = pr.state === 'merged' ? 'merged' : pr.state === 'closed' ? 'closed' : 'opened'

  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      title="Open on GitHub"
      className="group relative block rounded-lg bg-muted px-3.5 py-2.5 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-[2px]"><StateIcon state={pr.state} /></div>
        <div className="min-w-0 flex-1">
          <p className="pr-6 break-words text-[13.5px] leading-snug font-medium tracking-[-0.01em] text-foreground">
            {pr.title}
            <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">
              {showRepo ? `${pr.repo.split('/')[1]} ` : ''}#{pr.number}
            </span>
          </p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted-foreground">
            {showAuthor && (
              <>
                <span className="inline-flex items-center gap-1.5 text-foreground">
                  {pr.author.avatarUrl && <img src={pr.author.avatarUrl} alt="" width={14} height={14} className="size-3.5 rounded-full" />}
                  {pr.author.login}
                </span>
                <Sep />
              </>
            )}
            <span title={`${whenLabel} ${dateShort(when)} · ${ageLong(when)}`}>{whenLabel} {age(when)}</span>
            {live && pr.updatedAt !== pr.createdAt && (<><Sep /><span>active {age(pr.updatedAt)}</span></>)}
            {pr.base !== pr.defaultBranch && (<><Sep /><span className="max-w-[200px] truncate" title={`${pr.head} → ${pr.base}`}>→ {pr.base}</span></>)}
            <Sep />
            <span className="tabular-nums"><span className="text-ok">+{compact(pr.additions)}</span> <span className="text-bad">−{compact(pr.deletions)}</span></span>
            {pr.comments > 0 && (<><Sep /><span className="inline-flex items-center gap-1 tabular-nums"><MessageSquare className="size-3" strokeWidth={1.8} />{pr.comments}</span></>)}
            {pr.labels.slice(0, 3).map((l) => <Label key={l.name} {...l} />)}
            {live && (<><Sep /><Signals {...pr} /></>)}
          </div>
        </div>
      </div>

      <span aria-hidden className="absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        <ArrowUpRight className="size-3.5" strokeWidth={2} />
      </span>
    </a>
  )
}

export function PrCardSkeleton() {
  return (
    <div className="rounded-lg bg-muted px-3.5 py-2.5">
      <div className="flex items-start gap-2.5">
        <Bone className="mt-[2px] size-4 rounded-full bg-accent" />
        <div className="flex-1 space-y-2">
          <Bone className="h-3.5 w-3/5 bg-accent" />
          <Bone className="h-3 w-2/5 bg-accent" />
        </div>
      </div>
    </div>
  )
}

function Sep() {
  return <span aria-hidden className="h-3 w-px bg-border" />
}
