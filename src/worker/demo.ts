import type { Contributions, Payload, Pr } from '../shared/types'

/* Generated data for DEMO=1: two made-up accounts, a handful of made-up
   repos, and a year of contributions. Seeded, so every load looks the same.
   Avatars are inline SVG initials, so nothing points at a real user. */

let seed = 7
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))

const avatar = (name: string, hue: number) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="hsl(${hue} 30% 45%)"/><text x="20" y="25" font-family="sans-serif" font-size="15" fill="#fff" text-anchor="middle">${name.slice(0, 2).toUpperCase()}</text></svg>`,
  )

const ACCOUNTS = [
  { login: 'demo-user', repos: ['demo-user/dotfiles', 'demo-user/notes-app', 'acme-oss/ui-kit'] },
  { login: 'demo-work', repos: ['acme-corp/api', 'acme-corp/web', 'acme-corp/infra'] },
]
const PEOPLE = ['sam-k', 'riley-p', 'alex-m', 'jordan-l']
const TITLES = [
  'Add retry with backoff to upload client',
  'Fix timezone bug in weekly report',
  'Move auth middleware to edge',
  'Bump dependencies and drop Node 18',
  'Paginate the activity feed',
  'Cache search results for 60s',
  'Remove unused feature flags',
  'Add dark mode to settings page',
  'Split billing service into its own worker',
  'Handle empty state on dashboard',
  'Speed up CI by caching pnpm store',
  'Validate webhook signatures',
]
const LABELS = [
  { name: 'bug', color: 'd73a4a' },
  { name: 'enhancement', color: 'a2eeef' },
  { name: 'infra', color: '5319e7' },
]

const DAY = 86400_000

function makePr(i: number, account: string, repo: string, now: number): Pr {
  const created = now - int(1, 300) * DAY - int(0, 23) * 3600_000
  const roll = rand()
  const state: Pr['state'] = roll < 0.22 ? 'open' : roll < 0.28 ? 'draft' : roll < 0.9 ? 'merged' : 'closed'
  const decided = state === 'merged' || state === 'closed' ? Math.min(now, created + int(1, 9) * DAY) : null
  const role: Pr['role'] = state === 'open' && rand() < 0.3 ? 'reviewer' : 'author'
  const author = role === 'reviewer' ? pick(PEOPLE) : account
  const failed = state === 'open' && rand() < 0.2 ? int(1, 2) : 0
  const total = int(3, 9)
  const behind = state === 'open' && rand() < 0.35 ? int(1, 14) : 0
  const review: Pr['review'] = state === 'open' ? pick(['approved', 'review_required', 'review_required', 'changes_requested']) : 'approved'
  return {
    id: `demo-${i}`,
    account,
    role,
    author: { login: author, avatarUrl: avatar(author, (i * 47) % 360) },
    repo,
    number: 100 + i,
    title: pick(TITLES),
    url: `https://github.com/${repo}/pull/${100 + i}`,
    state,
    createdAt: new Date(created).toISOString(),
    updatedAt: new Date(decided ?? now - int(0, 72) * 3600_000).toISOString(),
    mergedAt: state === 'merged' ? new Date(decided!).toISOString() : null,
    closedAt: decided ? new Date(decided).toISOString() : null,
    base: 'main',
    head: `feature/${i}`,
    defaultBranch: 'main',
    isPrivate: repo.startsWith('acme-corp'),
    mergeable: behind > 10 ? 'conflicting' : 'mergeable',
    mergeState: behind ? 'BEHIND' : 'CLEAN',
    behindBy: state === 'open' || state === 'draft' ? behind : null,
    aheadBy: state === 'open' || state === 'draft' ? int(1, 6) : null,
    review,
    reviewers: review === 'review_required' ? [pick(PEOPLE)] : [],
    approvedBy: review === 'approved' ? [pick(PEOPLE)] : [],
    checks: failed ? 'failure' : state === 'draft' ? 'pending' : 'success',
    checkCounts: { total, failed, pending: state === 'draft' ? 1 : 0 },
    additions: int(4, 600),
    deletions: int(0, 300),
    changedFiles: int(1, 24),
    comments: int(0, 12),
    labels: rand() < 0.4 ? [pick(LABELS)] : [],
    autoMerge: state === 'open' && rand() < 0.2,
    stack: null,
    depth: 0,
    parent: null,
  }
}

function contributions(now: number, busy: number): Contributions {
  const days: Record<string, number> = {}
  const year = new Date(now).getUTCFullYear()
  for (let t = Date.UTC(year - 1, 0, 1); t <= now; t += DAY) {
    const weekday = new Date(t).getUTCDay()
    const p = weekday === 0 || weekday === 6 ? 0.25 : busy
    if (rand() < p) days[new Date(t).toISOString().slice(0, 10)] = int(1, weekday === 0 || weekday === 6 ? 3 : 12)
  }
  return { years: [year, year - 1], days }
}

export function demoPayload(): Payload {
  seed = 7
  const now = Date.now()
  const prs: Pr[] = []
  let i = 0
  for (const a of ACCOUNTS) for (let k = 0; k < 34; k++) prs.push(makePr(i++, a.login, pick(a.repos), now))

  /* One three-PR stack so the stack view has something to draw. */
  const stack = prs.filter((p) => p.account === 'demo-work' && p.role === 'author').slice(0, 3)
  stack.forEach((p, d) => {
    Object.assign(p, {
      repo: 'acme-corp/api', state: 'open', mergedAt: null, closedAt: null,
      title: ['Add rate limiter core', 'Wire rate limiter into routes', 'Expose rate limit headers'][d],
      head: `rate-limit/${d}`, base: d === 0 ? 'main' : `rate-limit/${d - 1}`,
      url: `https://github.com/acme-corp/api/pull/${p.number}`,
      stack: stack[0].id, depth: d, parent: d === 0 ? null : stack[d - 1].id,
      behindBy: d === 0 ? 3 : 0, aheadBy: 2, review: d === 0 ? 'approved' : 'review_required',
    } satisfies Partial<Pr>)
  })

  const at = new Date(now).toISOString()
  return {
    fetchedAt: at,
    checkedAt: at,
    fullAt: at,
    accounts: ACCOUNTS.map((a) => ({ login: a.login, ok: true })),
    prs,
    contributions: { 'demo-user': contributions(now, 0.55), 'demo-work': contributions(now, 0.8) },
  }
}
