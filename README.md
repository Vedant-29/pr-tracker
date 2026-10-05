# PR Tracker

One page that shows every pull request you have opened across one or more GitHub accounts, along with the reviews waiting on you and your contribution graph. It runs on a Cloudflare Worker, and you can run it locally with a GitHub token.

![PR Tracker in dark mode, showing mock data](docs/screenshot.jpg)

## Features

- Open, review, merged, closed, and all tabs, with search and repo filters
- Each PR card shows its age, check results, review state, and whether it is behind its base branch
- Stacked PRs (a PR based on another of your PRs) are drawn as a chain
- GitHub contribution calendar per account, including private activity
- Keyboard shortcuts: `1` all accounts, `2`-`9` a single account, `o` `r` `m` `c` `a` tabs, `/` search, `d` theme

Each card links to the PR on GitHub. The app does not fetch PR bodies, comments, or diffs.

## Requirements

- Node 22+ (Wrangler 4 needs it) and [pnpm](https://pnpm.io)
- A GitHub personal access token (classic, `repo` scope) for each account you want to track
- A Cloudflare account, only for deploying

## Setup

Clone or fork this repo, then:

```sh
pnpm install
cp .dev.vars.example .dev.vars
```

1. In `wrangler.jsonc`, set `ACCOUNTS` to your GitHub login(s), each paired with the name of the variable that holds its token. For example: `"octocat:GITHUB_TOKEN_1,octocat-work:GITHUB_TOKEN_2"`.
2. In `.dev.vars`, set each token variable. If you use the GitHub CLI, `gh auth token` prints one.

```sh
pnpm dev
```

Open http://localhost:5173.

To try it without a token, put `DEMO=1` in `.dev.vars`. The app then serves generated mock data. Local dev uses a simulated KV store, so the placeholder KV id in `wrangler.jsonc` is fine until you deploy.

## Services

Bring your own accounts and tokens. Nothing in this repo is a working credential.

| Service | Used for | Required | Env vars |
|---|---|---|---|
| GitHub GraphQL API | PRs, reviews, checks, contribution calendar | Yes | `ACCOUNTS`, `GITHUB_TOKEN_*` |
| Cloudflare Workers | Hosting, plus a cron trigger every 10 minutes | To deploy | None |
| Cloudflare Workers KV | Caches the PR data and counts login attempts | To deploy | `CACHE` binding in `wrangler.jsonc` |
| Cloudflare Access | Optional login in front of the passphrase | No | `ACCESS_TEAM`, `ACCESS_AUD` |

### GitHub

Create a classic personal access token with the `repo` scope at GitHub > Settings > Developer settings > Personal access tokens, one per account. An account whose token is missing shows "token not configured" and its PRs are left out. Between full refreshes, the worker skips quick updates for an account with fewer than 600 GraphQL rate-limit points left.

### Cloudflare Workers and KV

Run `pnpm exec wrangler kv namespace create CACHE` and paste the printed id into `kv_namespaces` in `wrangler.jsonc`. The cron schedule is set in `triggers` in the same file.

### Cloudflare Access

In the Zero Trust dashboard, add a self-hosted Access application for the hostname the Worker is served on. Set `ACCESS_TEAM` to your team name (the `<team>` in `<team>.cloudflareaccess.com`) and `ACCESS_AUD` to the application's Audience (AUD) tag. Both must be set, or Access checking is off. The Worker verifies the Access JWT on every request, so a request that skips Access is refused.

## Environment variables

Locally these go in `.dev.vars`. In production, set tokens and `APP_PASSWORD` with `pnpm exec wrangler secret put <NAME>`.

| Variable | Required | What it is for | Where to get it |
|---|---|---|---|
| `ACCOUNTS` | Yes | Comma-separated `login:TOKEN_VAR` pairs. Set in `wrangler.jsonc` | Your GitHub login(s) |
| `GITHUB_TOKEN_1`, `GITHUB_TOKEN_2`, ... | Yes | One token per account. The names just have to match `ACCOUNTS` | GitHub token page, or `gh auth token` |
| `APP_PASSWORD` | No | Puts a passphrase page in front of the app. Recommended once deployed, since the data includes private repos | Any long passphrase, for example `openssl rand -base64 32` |
| `SESSION_VERSION` | No | Change it to log out every session | Any string. Defaults to `1` |
| `ACCESS_TEAM`, `ACCESS_AUD` | No | Also require a Cloudflare Access login | Zero Trust dashboard, see Services |
| `DEMO` | No | Set to `1` to serve mock data instead of calling GitHub | |

## Deployment

```sh
pnpm exec wrangler login
pnpm exec wrangler kv namespace create CACHE   # paste the id into wrangler.jsonc
pnpm exec wrangler secret put GITHUB_TOKEN_1
pnpm exec wrangler secret put APP_PASSWORD
pnpm run deploy
```

Use `pnpm run deploy`, not `pnpm deploy`, which is a different built-in pnpm command. A cron job refreshes the data every 10 minutes and caches it in KV, so pages load without waiting on GitHub. To use your own domain, uncomment `routes` in `wrangler.jsonc`.

## Notes

- GitHub search returns at most 1000 PRs per account.
- With no `APP_PASSWORD` set, the page is open to anyone who has the URL.
- After 10 wrong passphrase attempts from one IP, login is blocked for 15 minutes.

## License

MIT. See [LICENSE](LICENSE).
