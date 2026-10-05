/* Cloudflare Access puts a signed JWT on every request it lets through.
   Verifying it here means a request that somehow reaches the Worker
   without going through Access is refused too. */

export type Jwk = JsonWebKey & { kid: string }

const enc = new TextEncoder()
const dec = new TextDecoder()

export const b64url = (s: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0))

let cache: { team: string; at: number; keys: Jwk[] } | null = null

/* The team's signing keys, cached an hour. Rotations keep the old key
   published for a while, so a miss means a bad token, not a stale cache. */
export async function accessKeys(team: string): Promise<Jwk[]> {
  if (cache && cache.team === team && Date.now() - cache.at < 3600_000) return cache.keys
  const res = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`)
  if (!res.ok) throw new Error(`Access certs ${res.status}`)
  const keys = ((await res.json()) as { keys: Jwk[] }).keys
  cache = { team, at: Date.now(), keys }
  return keys
}

export async function verifyAccessJwt(jwt: string, team: string, aud: string, loadKeys: (team: string) => Promise<Jwk[]> = accessKeys): Promise<boolean> {
  const [h, p, s] = jwt.split('.')
  if (!h || !p || !s) return false
  try {
    const header = JSON.parse(dec.decode(b64url(h))) as { kid?: string; alg?: string }
    const payload = JSON.parse(dec.decode(b64url(p))) as { iss?: string; aud?: string | string[]; exp?: number; nbf?: number }
    if (header.alg !== 'RS256' || !header.kid) return false
    if (payload.iss !== `https://${team}.cloudflareaccess.com`) return false
    if (!([] as string[]).concat(payload.aud ?? []).includes(aud)) return false
    const now = Date.now() / 1000
    if (typeof payload.exp !== 'number' || payload.exp < now) return false
    if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return false
    const jwk = (await loadKeys(team)).find((k) => k.kid === header.kid)
    if (!jwk) return false
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), enc.encode(`${h}.${p}`))
  } catch {
    return false
  }
}
