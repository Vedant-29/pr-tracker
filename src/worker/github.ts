import type { Checks, Contributions, Pr, Review } from '../shared/types'

const API = 'https://api.github.com/graphql'

const SEARCH = /* GraphQL */ `
  query ($q: String!, $first: Int!, $after: String) {
    search(query: $q, type: ISSUE, first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ... on PullRequest {
          id number title url state isDraft createdAt updatedAt mergedAt closedAt
          author { login avatarUrl }
          baseRefName headRefName mergeable mergeStateStatus reviewDecision
          additions deletions changedFiles
          comments { totalCount }
          reviewThreads { totalCount }
          reviewRequests(first: 5) { nodes { requestedReviewer {
            ... on User { login } } } }
          latestReviews(first: 10) { nodes { author { login } state } }
          labels(first: 6) { nodes { name color } }
          repository { nameWithOwner isPrivate defaultBranchRef { name } }
          autoMergeRequest { enabledAt }
          commits(last: 1) { nodes { commit { statusCheckRollup {
            state
            contexts(first: 20) { nodes {
              ... on CheckRun { conclusion status }
              ... on StatusContext { state }
            } }
          } } } }
        }
      }
    }
  }
`

type Node = {
  id: string
  number: number
  title: string
  url: string
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  isDraft: boolean
  author: { login: string; avatarUrl: string } | null
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  closedAt: string | null
  baseRefName: string
  headRefName: string
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  mergeStateStatus: string
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  additions: number
  deletions: number
  changedFiles: number
  comments: { totalCount: number }
  reviewThreads: { totalCount: number }
  reviewRequests: { nodes: { requestedReviewer: { login?: string } | null }[] }
  latestReviews: { nodes: { author: { login: string } | null; state: string }[] }
  labels: { nodes: { name: string; color: string }[] }
  repository: { nameWithOwner: string; isPrivate: boolean; defaultBranchRef: { name: string } | null }
  autoMergeRequest: { enabledAt: string } | null
  commits: { nodes: { commit: { statusCheckRollup: Rollup | null } }[] }
}

type Rollup = {
  state: string
  contexts: { nodes: ({ conclusion?: string | null; status?: string } | { state?: string })[] }
}

/* Points left this hour, per token, from the last response. Deltas stand
   down when it runs low so the cron's full rebuild always has room. */
const remaining = new Map<string, number>()
export const rateLeft = (token: string): number => remaining.get(token) ?? Infinity

/* GitHub's GraphQL edge throws the odd 502; one retry covers it. */
async function gql<T>(token: string, query: string, variables: Record<string, unknown>, attempt = 0): Promise<T> {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      authorization: `bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'pr-tracker',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (res.status >= 500 && attempt < 2) {
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
    return gql(token, query, variables, attempt + 1)
  }
  const left = Number(res.headers.get('x-ratelimit-remaining'))
  if (Number.isFinite(left)) remaining.set(token, left)
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)}`)
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
  if (json.errors?.length && !json.data) throw new Error(json.errors.map((e) => e.message).join('; '))
  return json.data as T
}

/* Search caps at 1000 results; 20 pages of 50 is that ceiling. */
async function searchAll(token: string, q: string, first = 50): Promise<Node[]> {
  const out: Node[] = []
  let after: string | null = null
  for (let page = 0; page < 20; page++) {
    const data: { search: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: Node[] } } =
      await gql(token, SEARCH, { q, first, after })
    out.push(...data.search.nodes.filter((n) => n && 'number' in n))
    if (!data.search.pageInfo.hasNextPage) break
    after = data.search.pageInfo.endCursor
  }
  return out
}

function checksOf(rollup: Rollup | null | undefined): { checks: Checks; counts: Pr['checkCounts'] } {
  if (!rollup) return { checks: 'none', counts: { total: 0, failed: 0, pending: 0 } }
  let failed = 0
  let pending = 0
  for (const c of rollup.contexts.nodes) {
    if ('conclusion' in c || 'status' in c) {
      const cr = c as { conclusion?: string | null; status?: string }
      if (cr.status !== 'COMPLETED') pending++
      else if (['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(cr.conclusion ?? '')) failed++
    } else {
      const sc = c as { state?: string }
      if (sc.state === 'PENDING' || sc.state === 'EXPECTED') pending++
      else if (sc.state === 'FAILURE' || sc.state === 'ERROR') failed++
    }
  }
  const total = rollup.contexts.nodes.length
  const checks: Checks =
    rollup.state === 'SUCCESS' ? 'success'
    : rollup.state === 'PENDING' || rollup.state === 'EXPECTED' ? 'pending'
    : total === 0 ? 'none' : 'failure'
  return { checks, counts: { total, failed, pending } }
}

function reviewOf(d: Node['reviewDecision']): Review {
  switch (d) {
    case 'APPROVED': return 'approved'
    case 'CHANGES_REQUESTED': return 'changes_requested'
    case 'REVIEW_REQUIRED': return 'review_required'
    default: return 'none'
  }
}

function stateOf(state: 'OPEN' | 'MERGED' | 'CLOSED', isDraft: boolean): Pr['state'] {
  return state === 'MERGED' ? 'merged' : state === 'CLOSED' ? 'closed' : isDraft ? 'draft' : 'open'
}

function mergeableOf(m: Node['mergeable']): Pr['mergeable'] {
  return m === 'MERGEABLE' ? 'mergeable' : m === 'CONFLICTING' ? 'conflicting' : 'unknown'
}

function toPr(account: string, n: Node, role: Pr['role'] = 'author'): Pr {
  const { checks, counts } = checksOf(n.commits.nodes[0]?.commit.statusCheckRollup)
  return {
    id: n.id,
    account,
    role,
    author: n.author ?? { login: 'ghost', avatarUrl: '' },
    repo: n.repository.nameWithOwner,
    number: n.number,
    title: n.title,
    url: n.url,
    state: stateOf(n.state, n.isDraft),
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    mergedAt: n.mergedAt,
    closedAt: n.closedAt,
    base: n.baseRefName,
    head: n.headRefName,
    defaultBranch: n.repository.defaultBranchRef?.name ?? 'main',
    isPrivate: n.repository.isPrivate,
    mergeable: mergeableOf(n.mergeable),
    mergeState: n.mergeStateStatus,
    behindBy: null,
    aheadBy: null,
    review: reviewOf(n.reviewDecision),
    reviewers: n.reviewRequests.nodes.map((r) => r.requestedReviewer?.login ?? '').filter(Boolean),
    approvedBy: n.latestReviews.nodes.filter((r) => r.state === 'APPROVED').map((r) => r.author?.login ?? '').filter(Boolean),
    checks,
    checkCounts: counts,
    additions: n.additions,
    deletions: n.deletions,
    changedFiles: n.changedFiles,
    comments: n.comments.totalCount + n.reviewThreads.totalCount,
    labels: n.labels.nodes,
    autoMerge: Boolean(n.autoMergeRequest),
    stack: null,
    depth: 0,
    parent: null,
  }
}

/* One aliased query per account: how far behind its base each open PR is.
   `mergeStateStatus` alone hides this — BLOCKED (missing review) wins over
   BEHIND, so a PR can need a rebase and not say so. */
async function attachBehind(token: string, prs: Pr[]): Promise<void> {
  const open = prs.filter((p) => p.state === 'open' || p.state === 'draft')
  if (!open.length) return
  const parts = open.map((p, i) => {
    const [owner, name] = p.repo.split('/')
    return `p${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
      ref(qualifiedName: ${JSON.stringify('refs/heads/' + p.base)}) {
        compare(headRef: ${JSON.stringify('refs/heads/' + p.head)}) { aheadBy behindBy }
      }
    }`
  })
  try {
    const data = await gql<Record<string, { ref: { compare: { aheadBy: number; behindBy: number } | null } | null }>>(
      token, `{ ${parts.join('\n')} }`, {})
    open.forEach((p, i) => {
      const cmp = data[`p${i}`]?.ref?.compare
      if (cmp) { p.behindBy = cmp.behindBy; p.aheadBy = cmp.aheadBy }
    })
  } catch {
    /* Non-fatal: the list still renders, just without the behind-count. */
  }
}

/* A stack is a chain of open PRs in one repo where each PR's base is the
   previous PR's head. Walk parents up to the root; the root's id names the
   stack. Merged/closed PRs still get linked if an open PR points at them, so
   a half-merged stack keeps its shape. */
function linkStacks(prs: Pr[]): void {
  for (const p of prs) { p.stack = null; p.depth = 0; p.parent = null }
  const byRepoHead = new Map<string, Pr>()
  for (const p of prs) {
    const key = `${p.repo}#${p.head}`
    const existing = byRepoHead.get(key)
    if (!existing || ((p.state === 'open' || p.state === 'draft') && existing.state !== 'open' && existing.state !== 'draft'))
      byRepoHead.set(key, p)
  }
  for (const p of prs) {
    if (p.base === p.defaultBranch) continue
    const parent = byRepoHead.get(`${p.repo}#${p.base}`)
    if (parent && parent !== p) p.parent = parent.id
  }
  const byId = new Map(prs.map((p) => [p.id, p]))
  for (const p of prs) {
    if (!p.parent) continue
    let depth = 0
    let cur: Pr | undefined = p
    const seen = new Set<string>()
    while (cur?.parent && !seen.has(cur.id)) { seen.add(cur.id); cur = byId.get(cur.parent); depth++ }
    if (cur) { p.stack = cur.id; p.depth = depth; cur.stack = cur.id }
  }
}

/* Every PR the account ever authored, plus the open ones someone has asked
   it to review. GitHub drops you from review-requested once you submit a
   review, so that second list is exactly "waiting on me". */
export async function fetchAccount(login: string, token: string): Promise<Pr[]> {
  const [mine, queue] = await Promise.all([
    searchAll(token, `is:pr author:${login} archived:false`),
    searchAll(token, `is:pr is:open review-requested:${login} -author:${login} archived:false`, 30),
  ])
  const seen = new Set<string>()
  const prs: Pr[] = []
  for (const n of mine) {
    if (seen.has(n.id)) continue
    seen.add(n.id)
    prs.push(toPr(login, n))
  }
  for (const n of queue) {
    if (seen.has(n.id)) continue
    seen.add(n.id)
    prs.push(toPr(login, n, 'reviewer'))
  }
  await attachBehind(token, prs)
  linkStacks(prs)
  return prs
}

/* Lean re-read of what can have moved since `since`: every open PR (checks
   and review state change without touching updatedAt) plus anything updated
   since, which catches merges, closes, new PRs and comments. Small pages,
   since a few PRs at most move in a couple of minutes. */
export async function fetchDelta(login: string, token: string, since: string, cached: Pr[]): Promise<Pr[]> {
  const stamp = new Date(new Date(since).getTime() - 5 * 60_000).toISOString().replace(/\.\d{3}Z$/, '+00:00')
  const [open, recent, queue] = await Promise.all([
    searchAll(token, `is:pr is:open author:${login} archived:false`, 30),
    searchAll(token, `is:pr author:${login} archived:false updated:>=${stamp}`, 20),
    searchAll(token, `is:pr is:open review-requested:${login} -author:${login} archived:false`, 30),
  ])
  /* The review queue is re-read whole: anything not in it any more (reviewed,
     merged, request withdrawn) leaves the list. */
  const byId = new Map(cached.filter((p) => p.account === login && p.role === 'author').map((p) => [p.id, p]))
  const seen = new Set<string>()
  for (const n of [...open, ...recent]) {
    if (seen.has(n.id)) continue
    seen.add(n.id)
    byId.set(n.id, toPr(login, n))
  }
  for (const n of queue) {
    if (seen.has(n.id)) continue
    seen.add(n.id)
    byId.set(n.id, toPr(login, n, 'reviewer'))
  }
  const prs = [...byId.values()]
  await attachBehind(token, prs)
  linkStacks(prs)
  return prs
}

/* ── Contribution calendar ─────────────────────────────────────────────── */
/* The same numbers as the graph on github.com/<login>. Asking as the user
   (their own token) includes private-repo activity, which a public
   scraper cannot see. Two round trips: the list of years,
   then every year's calendar in one aliased query. */
export async function fetchContributions(login: string, token: string): Promise<Contributions> {
  const yearsData = await gql<{ user: { contributionsCollection: { contributionYears: number[] } } }>(
    token,
    `query ($login: String!) { user(login: $login) { contributionsCollection { contributionYears } } }`,
    { login },
  )
  const years = [...yearsData.user.contributionsCollection.contributionYears].sort((a, b) => b - a)
  if (!years.length) return { years: [], days: {} }

  const parts = years.map((y) => `y${y}: contributionsCollection(
      from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z"
    ) { contributionCalendar { weeks { contributionDays { date contributionCount } } } }`)
  const data = await gql<{ user: Record<string, { contributionCalendar: { weeks: { contributionDays: { date: string; contributionCount: number }[] }[] } }> }>(
    token,
    `query ($login: String!) { user(login: $login) { ${parts.join('\n')} } }`,
    { login },
  )
  const days: Record<string, number> = {}
  for (const y of years) {
    for (const w of data.user[`y${y}`]?.contributionCalendar.weeks ?? []) {
      for (const d of w.contributionDays) if (d.contributionCount > 0) days[d.date] = d.contributionCount
    }
  }
  return { years, days }
}
