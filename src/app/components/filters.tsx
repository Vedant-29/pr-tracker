import { useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import type { PrState } from '../../shared/types'
import { repoShort } from '../lib/format'
import { useShortcut } from '../lib/shortcuts'
import { Select } from './select'

export type Sort = 'newest' | 'oldest'
export type StatusFilter = 'all' | PrState

export type FilterState = {
  search: string
  repo: string
  sort: Sort
  status: StatusFilter
}

/* One filter row shared by every tab. Status only shows on "all" — the
   other tabs are already a status. `/` focuses the search box. */
export function Filters({ state, repos, showStatus, onChange }: {
  state: FilterState
  repos: string[]
  showStatus: boolean
  onChange: (patch: Partial<FilterState>) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  useShortcut('/', () => input.current?.focus())
  useEffect(() => {
    if (state.repo !== 'all' && !repos.includes(state.repo)) onChange({ repo: 'all' })
  }, [repos, state.repo, onChange])

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <label className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} />
        <input
          ref={input}
          type="search"
          value={state.search}
          onChange={(e) => onChange({ search: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Escape') { onChange({ search: '' }); input.current?.blur() } }}
          placeholder="search title, #, repo, branch"
          aria-label="Search pull requests"
          className="h-8 w-full rounded-md bg-muted pr-9 pl-8 font-mono text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 font-mono text-[10px] text-muted-foreground opacity-50 sm:block">/</kbd>
      </label>
      {showStatus && (
        <Select<StatusFilter>
          label="Status"
          value={state.status}
          onChange={(status) => onChange({ status })}
          options={[
            { value: 'all', label: 'any status' },
            { value: 'open', label: 'open' },
            { value: 'draft', label: 'draft' },
            { value: 'merged', label: 'merged' },
            { value: 'closed', label: 'closed' },
          ]}
        />
      )}
      <Select<string>
        label="Repository"
        className="max-w-[220px]"
        value={repos.includes(state.repo) ? state.repo : 'all'}
        onChange={(repo) => onChange({ repo })}
        options={[{ value: 'all', label: 'any repo' }, ...repos.map((r) => ({ value: r, label: repoShort(r) }))]}
      />
      <Select<Sort>
        label="Sort"
        value={state.sort}
        onChange={(sort) => onChange({ sort })}
        options={[{ value: 'newest', label: 'newest first' }, { value: 'oldest', label: 'oldest first' }]}
      />
    </div>
  )
}
