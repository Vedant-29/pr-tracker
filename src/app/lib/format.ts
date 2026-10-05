const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR

/* "3d", "2w", "5mo" — terse because it sits in a mono meta line. */
export function age(iso: string, now = Date.now()): string {
  const ms = Math.max(0, now - new Date(iso).getTime())
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MIN))}m`
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`
  if (ms < 14 * DAY) return `${Math.round(ms / DAY)}d`
  if (ms < 60 * DAY) return `${Math.round(ms / (7 * DAY))}w`
  return `${Math.round(ms / (30 * DAY))}mo`
}

export function ageLong(iso: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / DAY)
  if (days === 0) return 'today'
  if (days === 1) return '1 day'
  return `${days} days`
}

export function dateShort(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso))
}

export function repoShort(full: string): string {
  return full.split('/')[1] ?? full
}

export function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)
}

export function dateFull(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
}

export function accountLabel(login: string): string {
  return login
}
