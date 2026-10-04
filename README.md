# Data center fund: interest site

A one-page, interest-only site, modeled on a Regulation Crowdfunding "testing the waters" communication. It collects a name, email, rough investment range and a non-binding acknowledgment. It never takes money, commitments or offers.

> All copy, the disclaimer, the FAQ and the privacy policy (`src/components/Privacy.tsx`) need review by a securities attorney before launch.

## Stack

| Piece | Choice |
|---|---|
| Frontend | React 19 + Vite 8, Tailwind CSS v4 (CSS-first `@theme` in `src/index.css`) |
| 3D intro | three.js via React Three Fiber + drei, lazy-loaded (`src/scene/`) |
| Scroll | Lenis; the camera path is driven by intro scroll progress (`src/scene/path.ts`) |
| Hosting | Cloudflare Pages (static assets + Pages Functions in `functions/api/`) |
| API | `POST /api/signup`, `GET /api/confirm` (logic in `server/`) |
| Bot check | Cloudflare Turnstile, verified server-side |
| Rate limiting | Per-IP, enforced in Postgres (see note below) |
| Database | Supabase Postgres, written only by the service role key |
| Email | Resend (any provider works; see `server/email.ts`) |

**Brand name:** change `BRAND_NAME` (and `CONTACT_EMAIL`) in `shared/brand.ts`. Everything reads from that one file: page, HTML titles, emails, disclaimer and footer.

**Motion:** Motion (the animation library) was in the original plan but isn't used. The design keeps one orchestrated moment (the 3D scrub). Everything else is plain CSS transitions, so a JS animation library would only add weight.

## Deploying on Cloudflare Pages

1. **Database.** In the Supabase SQL Editor, run `supabase/migrations/20261003000000_signups.sql`. Then enable `pg_cron` and run `20261003000100_retention.sql`; this is the 30-day purge of unconfirmed sign-ups promised in the privacy policy.
2. **Turnstile.** Create a widget in the Cloudflare dashboard for your domain. Note its site key and secret key.
3. **Email.** Verify a sending domain with Resend and create an API key.
4. **Pages project settings** (Settings > Build):
   - Framework preset: None (or Vite). Build command `npm run build`. Output directory `dist`. Root directory `/`.
   - Node: `.nvmrc` pins Node 22.
5. **Variables and secrets** (Settings > Variables and Secrets), for Production and Preview:

   | Name | Type | Notes |
   |---|---|---|
   | `VITE_TURNSTILE_SITE_KEY` | Plain text | Public site key. Needed **at build time**, so redeploy after setting it. |
   | `SUPABASE_URL` | Secret | `https://<project>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Secret | Service role key. It never reaches the browser. |
   | `TURNSTILE_SECRET_KEY` | Secret | |
   | `EMAIL_API_KEY` | Secret | Resend API key |
   | `EMAIL_FROM` | Plain text | e.g. `Brand <hello@yourdomain.com>` on the verified domain |

There is deliberately no `wrangler.jsonc`. A Wrangler file with `pages_build_output_dir` would become the source of truth and lock these dashboard settings.

**Rate limiting note:** Pages Functions don't support the Workers rate-limiting binding. Instead, `check_signup_rate_limit()` allows 5 attempts per IP per 10 minutes, counted in Postgres. If you later move to Workers with static assets, the binding could replace it.

## How sign-up works

1. The browser posts JSON to `/api/signup`. Turnstile only loads once the form nears the viewport.
2. The Function checks origin, content type and body size; reads the IP from `CF-Connecting-IP`; applies the rate limit; validates fields; verifies Turnstile; and flags (never rejects) disposable email domains and obviously fake names on the $10,000+ range.
3. `register_signup()` inserts the row, or, for an unconfirmed duplicate, rotates the token (at most once every 10 minutes). Only the SHA-256 hash of the token is stored, and tokens expire after 48 hours.
4. The response is identical for new, duplicate and confirmed emails, so the form can't reveal who signed up.
5. `/api/confirm?token=…` sets `confirmed = true` and redirects to `/?confirmed=confirmed#signup`.

Review flagged rows with `select * from signups where flagged;`.

Note that some corporate email security scanners pre-open links, which can confirm a sign-up without a human click. If that becomes a problem, change the confirm link to land on a page with a "Confirm" button that POSTs.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars          # local secrets (git-ignored)
echo 'VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA' > .env.local   # Turnstile always-pass test key
scripts/localdb/up.sh                   # Postgres + PostgREST in Docker on :54321; prints a service key
# put SUPABASE_REST_URL=http://localhost:54321 and the printed SERVICE_KEY into .dev.vars
npm run build && scripts/dev-api.sh     # wrangler pages dev on :8788
```

With `DEV_LOG_EMAILS=1` and no `EMAIL_API_KEY`, confirmation links are printed to the wrangler log instead of being emailed.

## Checks

| Command | What |
|---|---|
| `npm run typecheck` | TypeScript (app, functions, node configs) |
| `npm run lint` | ESLint |
| `npm test` | Unit tests for the API handlers and flag heuristics |
| `npm run test:e2e` | Playwright against :8788. Sign-up → DB row with IP → confirm link → duplicate, inline validation, hard-rules copy check, axe (WCAG 2.1 AA). Needs the local DB and dev server running. |
| `node scripts/shots.ts http://localhost:8788 reports/shots [--intro] [--reduced]` | Screenshots at 1440 / 768 / 375 |

## 3D and fallbacks

- Page text and CTAs render first. The 3D chunk (~250 KB gzipped) is requested when the browser goes idle.
- Mobile gets fewer instances, lower DPR and no antialiasing.
- `prefers-reduced-motion`, no WebGL, or a software-only renderer (SwiftShader / llvmpipe) all get a static intro: the silhouette with the "your share" segment, and the five beats as text.
- Append `?force3d` to the URL to force WebGL on a software renderer (for testing).
- The canvas stops rendering once the intro scrolls out of view.

## Before launch

- [ ] Brand name, domain and trademark check (`shared/brand.ts`)
- [ ] Contact email (`shared/brand.ts`)
- [ ] Email provider, sending domain and `EMAIL_FROM`
- [ ] Securities attorney review of disclaimer, FAQ and all copy
- [ ] Finalize the privacy policy (`src/components/Privacy.tsx`)
- [ ] Project details (region, timeline) once known
