import { useCallback, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { Pr } from '../shared/types'
import { usePrs } from './lib/data'
import { accountLabel, age } from './lib/format'
import { usePersisted } from './lib/persist'
import { useShortcut } from './lib/shortcuts'
import { Analytics, AnalyticsSkeleton } from './components/analytics'
import { ContributionGraph, ContributionsSkeleton } from './components/contributions'
import { Filters, type FilterState } from './components/filters'
import { Login } from './components/login'
import { PrCard, PrCardSkeleton } from './components/pr-row'
import { PrTable } from './components/pr-table'
import { Bone, Pill, Section } from './components/section'
import { Stack } from './components/stack'
import { Stats, StatsSkeleton } from './components/stats'
import { ThemeToggle } from './components/theme-toggle'

type View = 'open' | 'review' | 'merged' | 'closed' | 'all'
const VIEWS: { id: View; key: string }[] = [{ id: 'open', key: 'o' }, { id: 'review', key: 'r' }, { id: 'merged', key: 'm' }, { id: 'closed', key: 'c' }, { id: 'all', key: 'a' }]

const matches = (p: Pr, q: string) => !q || `${p.title} #${p.number} ${p.repo} ${p.head}`.toLowerCase().includes(q)
const decidedAt = (p: Pr) => p.mergedAt ?? p.closedAt ?? p.updatedAt

export function App() {
  const { data, checkedAt, status, error, refreshing, reload, setStatus } = usePrs()
  const [account, setAccount] = usePersisted<string | null>('account', null)
  const [view, setView] = usePersisted<View>('view', 'open')
  const [repoF, setRepoF] = usePersisted<string>('filter.repo', 'all')
  const [sort, setSort] = usePersisted<FilterState['sort']>('filter.sort', 'newest')
  const [statusF, setStatusF] = usePersisted<FilterState['status']>('filter.status', 'all')
  const [search, setSearch] = useState('')

  const onFilter = useCallback((patch: Partial<FilterState>) => {
    if (patch.search !== undefined) setSearch(patch.search)
    if (patch.repo !== undefined) setRepoF(patch.repo)
    if (patch.sort !== undefined) setSort(patch.sort)
    if (patch.status !== undefined) setStatusF(patch.status)
  }, [setRepoF, setSort, setStatusF])

  const accounts = useMemo(() => data?.accounts.map((a) => a.login) ?? [], [data])

  /* Overview tiles and analytics rows jump into the list, pre-filtered. */
  const jump = useCallback((v: View, repo?: string) => {
    setView(v)
    if (repo !== undefined) setRepoF(repo)
    setStatusF('all')
    requestAnimationFrame(() => document.getElementById('prs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [setView, setRepoF, setStatusF])
  const activeAccount = account && accounts.includes(account) ? account : null

  /* Shortcuts: 1 all, 2-9 accounts, o/r/m/c/a tabs, / search, d theme. */
  useShortcut('1', useCallback(() => setAccount(null), [setAccount]))
  /* Fixed count, so hook order is stable across renders. */
  for (let i = 0; i < 8; i++) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useShortcut(String(i + 2), useCallback(() => accounts[i] && setAccount(accounts[i]), [accounts, setAccount, i]))
  }
  useShortcut('o', useCallback(() => setView('open'), [setView]))
  useShortcut('r', useCallback(() => setView('review'), [setView]))
  useShortcut('m', useCallback(() => setView('merged'), [setView]))
  useShortcut('c', useCallback(() => setView('closed'), [setView]))
  useShortcut('a', useCallback(() => setView('all'), [setView]))

  /* Authored PRs drive the stats, graphs and the open/merged/closed/all
     tabs; PRs waiting on my review are their own tab. */
  const inScope = useMemo(() => (data?.prs ?? []).filter((p) => !activeAccount || p.account === activeAccount), [data, activeAccount])
  const scoped = useMemo(() => inScope.filter((p) => p.role === 'author'), [inScope])
  const queue = useMemo(() => inScope.filter((p) => p.role === 'reviewer'), [inScope])
  const repos = useMemo(() => [...new Set((view === 'review' ? queue : scoped).map((p) => p.repo))].sort(), [scoped, queue, view])
  const q = search.trim().toLowerCase()
  const listed = useMemo(() => {
    const pool = view === 'review' ? queue : scoped
    const byView = pool.filter((p) =>
      (repoF === 'all' || p.repo === repoF) && matches(p, q) && (
        view === 'open' || view === 'review' ? p.state === 'open' || p.state === 'draft'
        : view === 'all' ? statusF === 'all' || p.state === statusF
        : p.state === view))
    const key = view === 'open' || view === 'review' ? (p: Pr) => p.updatedAt : view === 'all' ? (p: Pr) => p.createdAt : decidedAt
    return byView.sort((a, b) => (sort === 'newest' ? key(b).localeCompare(key(a)) : key(a).localeCompare(key(b))))
  }, [scoped, queue, view, repoF, q, statusF, sort])

  const counts = useMemo(() => ({
    open: scoped.filter((p) => p.state === 'open' || p.state === 'draft').length,
    review: queue.length,
    merged: scoped.filter((p) => p.state === 'merged').length,
    closed: scoped.filter((p) => p.state === 'closed').length,
    all: scoped.length,
    attention: scoped.filter((p) => (p.state === 'open' || p.state === 'draft') && (p.mergeable === 'conflicting' || (p.behindBy ?? 0) > 0 || p.checks === 'failure' || p.review === 'changes_requested')).length,
  }), [scoped, queue])
  const sources = useMemo(
    () => (data ? accounts.filter((l) => !activeAccount || l === activeAccount).map((login) => ({ login, data: data.contributions[login] ?? { years: [], days: {} } })) : []),
    [data, accounts, activeAccount],
  )

  return (
    <div className="relative z-[2] min-h-[100svh]">
      <div className="mx-auto w-full max-w-[880px] px-5 pb-24">
        <header className="pt-4">
          <div className="flex items-center justify-between">
            <span className="font-pixel text-[15px] text-foreground">PRs</span>
            <div className="flex items-center gap-1">
              {status === 'ready' && data && (
                <button
                  type="button"
                  onClick={() => void reload(true)}
                  title={`Live: checks GitHub every minute or so while open. Last checked ${age(checkedAt ?? data.fetchedAt)} ago, last change ${age(data.fetchedAt)} ago. Click for a full rebuild.`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} strokeWidth={1.7} />
                  <span>{age(checkedAt ?? data.fetchedAt)}</span>
                </button>
              )}
              <ThemeToggle />
            </div>
          </div>
          {status !== 'unauthed' && (
            <div className="mt-2.5 flex items-center gap-1.5">
              {status === 'ready' && data ? (
                <>
                  <Pill active={activeAccount === null} onClick={() => setAccount(null)} hint="1">All</Pill>
                  {accounts.map((l, i) => (
                    <Pill key={l} active={activeAccount === l} onClick={() => setAccount(l)} title={l} hint={String(i + 2)}>{accountLabel(l)}</Pill>
                  ))}
                </>
              ) : (
                [0, 1, 2].map((i) => <Bone key={i} className="h-[22px] w-16 rounded-full" />)
              )}
            </div>
          )}
        </header>

        <main>
          {status === 'unauthed' && <Login onDone={() => { setStatus('loading'); void reload() }} />}
          {status === 'error' && (
            <div className="mt-10 font-mono text-[12px] text-bad">
              Couldn't load: {error}
              <button type="button" onClick={() => void reload()} className="ml-3 underline">retry</button>
            </div>
          )}
          {status === 'loading' && <PageSkeleton />}

          {status === 'ready' && data && (
            <>
              {data.accounts.filter((a) => !a.ok).map((a) => (
                <p key={a.login} className="mt-4 font-mono text-[11.5px] text-bad">{accountLabel(a.login)}: {a.error}</p>
              ))}

              <Section id="overview" title="Overview" className="mt-6">
                <Stats prs={scoped} onPick={(k) => jump(k === 'total' || k === 'repos' ? 'all' : k, 'all')} />
              </Section>
              <ContributionGraph sources={sources} />
              <Analytics prs={scoped} onRepo={(repo) => jump('all', repo)} onMonth={() => jump('all')} />

              <Section
                id="prs"
                title="Pull requests"
                aside={
                  view === 'open' && counts.attention > 0 ? <span className="font-mono text-[11.5px] text-warn">{counts.attention} need attention</span>
                  : view === 'review' && counts.review > 0 ? <span className="font-mono text-[11.5px] text-warn">{counts.review} waiting on you</span>
                  : null
                }
              >
                <nav className="flex gap-5 border-b border-border">
                  {VIEWS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setView(v.id)}
                      title={`${v.id} (${v.key})`}
                      className={`-mb-px border-b pb-2 font-pixel text-[14px] whitespace-nowrap transition-colors ${
                        view === v.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {v.id} <span className="ml-0.5 font-mono text-[11px] opacity-70">{counts[v.id]}</span>
                    </button>
                  ))}
                </nav>

                <Filters state={{ search, repo: repoF, sort, status: statusF }} repos={repos} showStatus={view === 'all'} onChange={onFilter} />

                {view === 'all'
                  ? <PrTable rows={listed} total={scoped.length} />
                  : <PrList prs={listed} view={view} />}
              </Section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

/* Open view: grouped by repo, most recently active repo first; inside a
   repo, stacks render as a chain and everything else as cards. Merged and
   closed: a flat list, repo shown on each card. Order comes in from the
   sort filter. */
function PrList({ prs, view }: { prs: Pr[]; view: View }) {
  if (!prs.length) {
    return <p className="mt-6 font-mono text-[12px] text-muted-foreground">{view === 'review' ? 'Nothing waiting on your review.' : 'Nothing here.'}</p>
  }

  if (view !== 'open' && view !== 'review') {
    return <div className="mt-3 space-y-1.5">{prs.map((p) => <PrCard key={p.id} pr={p} showRepo />)}</div>
  }

  const byRepo = new Map<string, Pr[]>()
  for (const p of prs) byRepo.set(p.repo, [...(byRepo.get(p.repo) ?? []), p])

  return (
    <div className="mt-4 space-y-6">
      {[...byRepo.entries()].map(([repo, list]) => {
        const stacks = new Map<string, Pr[]>()
        const singles: Pr[] = []
        for (const p of list) {
          if (p.stack) stacks.set(p.stack, [...(stacks.get(p.stack) ?? []), p])
          else singles.push(p)
        }
        const chains = [...stacks.values()].filter((s) => s.length > 1)
        for (const s of [...stacks.values()].filter((s) => s.length === 1)) singles.push(s[0])
        const [owner, name] = repo.split('/')
        return (
          <section key={repo}>
            <h3 className="mb-2 flex items-baseline gap-2 font-mono text-[12px]">
              <span className="text-foreground">{name}</span>
              <span className="text-muted-foreground">{owner} · {list.length}</span>
            </h3>
            <div className="space-y-1.5">
              {chains.map((s) => <Stack key={s[0].stack} prs={s} />)}
              {singles.map((p) => <PrCard key={p.id} pr={p} showAuthor={view === 'review'} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function PageSkeleton() {
  return (
    <>
      <Section id="overview" title="Overview" className="mt-6"><StatsSkeleton /></Section>
      <ContributionsSkeleton />
      <AnalyticsSkeleton />
      <Section id="prs" title="Pull requests">
        <div className="flex gap-5 border-b border-border pb-2">{[0, 1, 2, 3, 4].map((i) => <Bone key={i} className="h-4 w-14" />)}</div>
        <div className="mt-3 flex gap-2"><Bone className="h-8 flex-1" /><Bone className="h-8 w-28" /><Bone className="h-8 w-28" /></div>
        <div className="mt-4 space-y-1.5">{[0, 1, 2, 3, 4].map((i) => <PrCardSkeleton key={i} />)}</div>
      </Section>
    </>
  )
}
