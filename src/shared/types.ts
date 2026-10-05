/* Shape of a PR as the worker hands it to the UI. Everything the page shows
   is derived server-side so the client stays a dumb renderer. */

export type PrState = 'open' | 'draft' | 'merged' | 'closed'
export type Checks = 'success' | 'failure' | 'pending' | 'none'
export type Review =
  | 'approved'
  | 'changes_requested'
  | 'review_required'
  | 'none'

export type Pr = {
  id: string
  account: string
  /* author: I opened it. reviewer: someone asked me to review it. */
  role: 'author' | 'reviewer'
  author: { login: string; avatarUrl: string }
  repo: string
  number: number
  title: string
  url: string
  state: PrState
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  closedAt: string | null
  base: string
  head: string
  defaultBranch: string
  isPrivate: boolean
  mergeable: 'mergeable' | 'conflicting' | 'unknown'
  mergeState: string
  /* Commits the head is behind its base by. > 0 means "needs rebase/update". */
  behindBy: number | null
  aheadBy: number | null
  review: Review
  reviewers: string[]
  approvedBy: string[]
  checks: Checks
  checkCounts: { total: number; failed: number; pending: number }
  additions: number
  deletions: number
  changedFiles: number
  comments: number
  labels: { name: string; color: string }[]
  autoMerge: boolean
  /* Stack membership: PRs in the same repo whose base is another open PR's
     head form a chain. `stack` is the chain's id (the root PR's id), `depth`
     is 0 for the bottom PR, `parent` the PR directly beneath this one. */
  stack: string | null
  depth: number
  parent: string | null
}

/* GitHub's own contribution calendar (commits, PRs, issues, reviews — the
   same numbers github.com/<user> shows, private included since we ask as
   the user). Only non-zero days are stored. */
export type Contributions = {
  years: number[]
  days: Record<string, number>
}

export type Payload = {
  /* When the data last changed (the ETag), when GitHub was last asked, and
     when the last full rebuild (contributions included) ran. */
  fetchedAt: string
  checkedAt: string
  fullAt: string
  accounts: { login: string; ok: boolean; error?: string }[]
  prs: Pr[]
  contributions: Record<string, Contributions>
}
