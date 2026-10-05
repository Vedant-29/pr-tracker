import type { Contributions, Payload, Pr } from '../shared/types'
import { verifyAccessJwt } from './access'
import { demoPayload } from './demo'
import { fetchAccount, fetchContributions, fetchDelta, rateLeft } from './github'

interface Env {
  ASSETS: Fetcher
  CACHE: KVNamespace
  ACCOUNTS: string
  APP_PASSWORD?: string
  /* Bump to log every browser out without changing the passphrase. */
  SESSION_VERSION?: string
  /* Set both to require a Cloudflare Access login on top of the passphrase:
     the team domain prefix (<team>.cloudflareaccess.com) and the
     application's audience tag. Unset = passphrase only. */
  ACCESS_TEAM?: string
  ACCESS_AUD?: string
  /* "1" serves generated mock data and never calls GitHub. */
  DEMO?: string
  [k: string]: unknown
}

const COOKIE = 'prt'
const SESSION_DAYS = 30
const KV_KEY = 'payload'
/* Ask GitHub for changes when a request finds the cache older than this. */
const DELTA_MS = 75_000
/* The cron does a full rebuild every 10 min; if it hasn't (cold start,
   missed tick), a request older than this triggers one. */
const FULL_MS = 15 * 60_000
/* Login attempts per IP per window before a 429. The passphrase is ~2^166,
   so this is hygiene, not the defence. */
const LOGIN_LIMIT = 10
const LOGIN_WINDOW_S = 15 * 60

/* ── Crypto helpers ─────────────────────────────────────────────────────── */
const enc = new TextEncoder()

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg))
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, '')
}

/* Compare by digest so lengths always match and no byte is compared
   early — a plain `===` bails on the first mismatch. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  /* Workers ships timingSafeEqual on SubtleCrypto; the types lag behind. */
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (x: ArrayBuffer, y: ArrayBuffer) => boolean }
  if (subtle.timingSafeEqual) return subtle.timingSafeEqual(da, db)
  const x = new Uint8Array(da), y = new Uint8Array(db)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

const sessionKey = (env: Env) => `${env.APP_PASSWORD}|${env.SESSION_VERSION ?? '1'}`

function cookieValue(req: Request, name: string): string | null {
  const m = (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return m ? m[1] : null
}

/* ── Passphrase session ─────────────────────────────────────────────────── */
async function authed(req: Request, env: Env): Promise<boolean> {
  if (!env.APP_PASSWORD) return true // unset = open (local dev)
  const v = cookieValue(req, COOKIE)
  if (!v) return false
  const [exp, sig] = v.split('.')
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false
  return sameSecret(sig, await hmac(sessionKey(env), exp))
}

async function login(req: Request, env: Env): Promise<Response> {
  if (!env.APP_PASSWORD) return Response.json({ ok: true })
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown'
  const rlKey = `rl:login:${ip}`
  const tries = Number((await env.CACHE.get(rlKey)) ?? 0)
  if (tries >= LOGIN_LIMIT) return Response.json({ ok: false, error: 'too many attempts, try later' }, { status: 429, headers: { 'retry-after': String(LOGIN_WINDOW_S) } })

  const { password } = (await req.json().catch(() => ({}))) as { password?: string }
  if (typeof password !== 'string' || !(await sameSecret(password, env.APP_PASSWORD))) {
    await env.CACHE.put(rlKey, String(tries + 1), { expirationTtl: LOGIN_WINDOW_S })
    await new Promise((r) => setTimeout(r, 400))
    return Response.json({ ok: false }, { status: 401 })
  }
  const exp = String(Date.now() + SESSION_DAYS * 86400_000)
  const sig = await hmac(sessionKey(env), exp)
  return Response.json({ ok: true }, {
    headers: { 'set-cookie': `${COOKIE}=${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}` },
  })
}

/* ── Cloudflare Access (optional second layer) ──────────────────────────── */
async function accessOk(req: Request, env: Env): Promise<boolean> {
  const jwt = req.headers.get('cf-access-jwt-assertion') ?? cookieValue(req, 'CF_Authorization')
  return jwt ? verifyAccessJwt(jwt, env.ACCESS_TEAM!, env.ACCESS_AUD!) : false
}

/* ── Headers every response carries ─────────────────────────────────────── */
/* Only same-origin scripts run, nothing may frame the page, the API is the
   only place the page can talk to, and the only remote images are GitHub
   avatars (data: is the noise texture in index.css). */
function secure(res: Response, nonce?: string, dev = false): Response {
  const out = new Response(res.body, res)
  const h = out.headers
  h.set('content-security-policy', [
    "default-src 'self'",
    /* Vite's dev client injects an inline React Refresh preamble. */
    `script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ''}${dev ? " 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https://avatars.githubusercontent.com data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '))
  h.set('x-frame-options', 'DENY')
  h.set('x-content-type-options', 'nosniff')
  h.set('referrer-policy', 'no-referrer')
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  h.set('x-robots-tag', 'noindex, nofollow, noarchive')
  h.set('strict-transport-security', 'max-age=31536000; includeSubDomains')
  h.set('cross-origin-opener-policy', 'same-origin')
  h.set('cross-origin-resource-policy', 'same-origin')
  return out
}

/* ── The wall ───────────────────────────────────────────────────────────── */
/* Served to anyone without a session, for every non-API path. Self-
   contained: no app bundle, no account names, nothing to learn from it. */
function wall(): Response {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>·</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#171717;--muted:#f5f5f5;--mf:#737373;--ring:#d0d0d0;--bad:#c2503c}
@media(prefers-color-scheme:dark){:root{--bg:#181818;--fg:#ededed;--muted:#242424;--mf:#807d77;--ring:#3d3d3d;--bad:#e07a68}}
html,body{height:100%;margin:0;background:var(--bg);color:var(--fg);font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;-webkit-font-smoothing:antialiased}
form{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px}
.row{display:flex;gap:6px;width:min(300px,calc(100% - 40px))}
input{flex:1;min-width:0;height:36px;padding:0 12px;border:0;border-radius:6px;background:var(--muted);color:var(--fg);font:inherit;outline:none}
input:focus{box-shadow:0 0 0 1px var(--ring)}input[aria-invalid=true]{box-shadow:0 0 0 1px var(--bad)}
button{width:36px;height:36px;border:0;border-radius:6px;background:var(--fg);color:var(--bg);cursor:pointer;display:grid;place-items:center}
button:disabled{opacity:.3;cursor:default}
p{height:16px;margin:0;font-size:11.5px;color:var(--bad);opacity:0;transition:opacity .15s}p.on{opacity:1}
</style></head><body>
<form id="f" autocomplete="off"><div class="row"><input id="p" type="password" placeholder="passphrase" aria-label="Passphrase" autofocus autocomplete="current-password"><button id="b" type="submit" disabled aria-label="Enter"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button></div><p id="m"></p></form>
<script nonce="${nonce}">
var f=document.getElementById('f'),p=document.getElementById('p'),b=document.getElementById('b'),m=document.getElementById('m');
p.oninput=function(){b.disabled=!p.value;p.removeAttribute('aria-invalid');m.className=''};
f.onsubmit=function(e){e.preventDefault();if(!p.value)return;b.disabled=true;
fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:p.value})}).then(function(r){
if(r.ok){location.reload();return}
m.textContent=r.status===429?'Too many attempts. Try again later.':'Wrong passphrase';m.className='on';p.setAttribute('aria-invalid','true');b.disabled=false;p.focus()})};
</script></body></html>`
  return secure(new Response(html, { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }), nonce)
}

/* ── Data ───────────────────────────────────────────────────────────────── */
function accounts(env: Env): { login: string; token: string | undefined }[] {
  return env.ACCOUNTS.split(',').map((pair) => {
    const [login, varName] = pair.trim().split(':')
    return { login, token: env[varName] as string | undefined }
  })
}

const EMPTY: Contributions = { years: [], days: {} }

async function build(env: Env): Promise<Payload> {
  const results = await Promise.all(
    accounts(env).map(async ({ login, token }) => {
      if (!token) return { login, ok: false, error: 'token not configured', prs: [] as Pr[], contributions: EMPTY }
      try {
        const [prs, contributions] = await Promise.all([fetchAccount(login, token), fetchContributions(login, token)])
        return { login, ok: true, prs, contributions }
      } catch (e) {
        return { login, ok: false, error: (e as Error).message, prs: [] as Pr[], contributions: EMPTY }
      }
    }),
  )
  const now = new Date().toISOString()
  return {
    fetchedAt: now,
    checkedAt: now,
    fullAt: now,
    accounts: results.map(({ login, ok, error }) => ({ login, ok, error })),
    prs: results.flatMap((r) => r.prs),
    contributions: Object.fromEntries(results.map((r) => [r.login, r.contributions])),
  }
}

/* The cheap path between full rebuilds: re-read open PRs and anything
   updated since the last check, merge into the cached payload, and bump
   fetchedAt only if something actually changed so ETags stay stable. */
async function delta(env: Env, cached: Payload): Promise<Payload> {
  const results = await Promise.all(
    accounts(env).map(async ({ login, token }) => {
      if (!token || rateLeft(token) < 600) return null
      try { return { login, prs: await fetchDelta(login, token, cached.checkedAt, cached.prs) } }
      catch { return null }
    }),
  )
  let prs = cached.prs
  for (const r of results) if (r) prs = [...prs.filter((p) => p.account !== r.login), ...r.prs]
  const key = (list: Pr[]) => JSON.stringify([...list].sort((a, b) => a.id.localeCompare(b.id)))
  const changed = key(prs) !== key(cached.prs)
  const now = new Date().toISOString()
  return { ...cached, prs, checkedAt: now, fetchedAt: changed ? now : cached.fetchedAt }
}

/* A full rebuild takes 10–20s against GitHub, so nobody waits on one: the
   cron keeps KV warm, and requests only ever trigger work in the
   background. One job at a time — a delta never races a rebuild. */
let inflight: Promise<string> | null = null
function run(job: Promise<Payload>, env: Env): Promise<string> {
  if (!inflight) {
    inflight = job
      .then(async (p) => {
        const body = JSON.stringify(p)
        await env.CACHE.put(KV_KEY, body)
        return body
      })
      .finally(() => { inflight = null })
  }
  return inflight
}
const refresh = (env: Env) => run(build(env), env)

async function prs(req: Request, env: Env, ctx: ExecutionContext, force: boolean): Promise<Response> {
  if (env.DEMO === '1') return respond(JSON.stringify(demoPayload()), 'demo')
  const cached = await env.CACHE.get(KV_KEY)
  if (!cached) return respond(await refresh(env), 'miss')
  if (force) return respond(await refresh(env), 'refresh')

  const payload = JSON.parse(cached) as Payload
  const now = Date.now()
  const sinceCheck = now - new Date(payload.checkedAt ?? payload.fetchedAt).getTime()
  const sinceFull = now - new Date(payload.fullAt ?? payload.fetchedAt).getTime()
  if (sinceFull > FULL_MS) ctx.waitUntil(refresh(env))
  else if (sinceCheck > DELTA_MS) ctx.waitUntil(run(delta(env, payload), env))

  if (req.headers.get('if-none-match') === `"${payload.fetchedAt}"`) {
    return new Response(null, { status: 304, headers: { ...stamps(payload), 'cache-control': 'no-store' } })
  }
  return respond(cached, sinceCheck > DELTA_MS ? 'stale' : 'hit')
}

/* ETag is the data's change time; x-checked-at says when GitHub was last
   asked, so a 304 can still move the "checked Ns ago" label. */
function stamps(p: Pick<Payload, 'fetchedAt' | 'checkedAt'>): Record<string, string> {
  return { etag: `"${p.fetchedAt}"`, 'x-checked-at': p.checkedAt ?? p.fetchedAt }
}

function respond(body: string, cache: string): Response {
  const fetchedAt = body.match(/"fetchedAt":"([^"]+)"/)?.[1] ?? ''
  const checkedAt = body.match(/"checkedAt":"([^"]+)"/)?.[1] ?? fetchedAt
  return json(body, { 'x-cache': cache, ...stamps({ fetchedAt, checkedAt }) })
}

const json = (body: string, extra: Record<string, string> = {}, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } })

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const url = new URL(req.url)

    /* Layer 0: Cloudflare Access, when configured. Nothing at all without it. */
    if (env.ACCESS_TEAM && env.ACCESS_AUD && !(await accessOk(req, env))) {
      return secure(new Response('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } }))
    }

    if (url.pathname === '/api/login' && req.method === 'POST') return secure(await login(req, env))
    if (url.pathname === '/api/logout') {
      return secure(new Response(null, { status: 204, headers: { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0`, 'cache-control': 'no-store' } }))
    }

    const ok = await authed(req, env)
    if (url.pathname === '/api/me') return secure(json(JSON.stringify({ authed: ok, gate: Boolean(env.APP_PASSWORD) })))

    if (url.pathname.startsWith('/api/')) {
      if (!ok) return secure(json(JSON.stringify({ error: 'unauthorized' }), {}, 401))
      if (url.pathname === '/api/prs') return secure(await prs(req, env, ctx, url.searchParams.has('refresh')))
      return secure(json(JSON.stringify({ error: 'not found' }), {}, 404))
    }

    /* Layer 1: the passphrase. Without a session there is no app — just the
       wall for pages, and nothing at all for assets. */
    if (!ok) {
      if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/')) {
        return secure(new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } }))
      }
      return wall()
    }
    const res = secure(await env.ASSETS.fetch(req), undefined, url.hostname === 'localhost')
    if ((res.headers.get('content-type') ?? '').includes('text/html')) res.headers.set('cache-control', 'no-store')
    return res
  },

  async scheduled(_event, env, ctx): Promise<void> {
    if (env.DEMO === '1') return
    ctx.waitUntil(refresh(env))
  },
} satisfies ExportedHandler<Env>
