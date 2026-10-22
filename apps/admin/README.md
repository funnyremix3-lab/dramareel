# Reel Drama admin

Web dashboard for content, video processing, users, moderation, ads, products, notifications, reports and the audit log. It talks only to the Reel Drama API (`apps/api`), which enforces every permission. The permission checks in this app only decide what the UI shows.

Stack: Next.js 16 (App Router, Turbopack, `output: "standalone"`), React 19, TypeScript (strict), Tailwind CSS 4, TanStack Query 5, Zod 4, Radix UI primitives (dialog, dropdown menu), Supabase JS (email one-time codes), Vitest 5 with Testing Library (jsdom).

## Setup

```bash
cd apps/admin
npm install
cp .env.example .env.local    # then edit
npm run dev                    # http://localhost:3001
```

The API must allow the admin origin. In `apps/api/.env`:

```
CORS_ORIGINS=http://localhost:3001
```

Start the API (see the root README): `cd apps/api && npm run dev`, or `npm run build && PORT=3000 node dist/main.js`.

## Environment

All values are public and are inlined into the browser bundle at build time. Never put a secret (for example a Supabase service-role key) in this app.

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000/api/v1` | API base URL, including `/api/v1` |
| `NEXT_PUBLIC_SUPABASE_URL` | empty | Supabase project URL, for email one-time-code sign-in |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | empty | Supabase anon (public) key |
| `NEXT_PUBLIC_DEV_LOGIN` | `false` | `true` shows dev sign-in buttons that call `POST /dev/token` (owner, content, ads, support, viewer). The API only exposes that route outside production. |

## Sign-in and permissions

- **Production:** Supabase email OTP with `shouldCreateUser: false`. Admin accounts must already exist and hold a role in the API database. The Supabase access token is sent as `Authorization: Bearer …`, and supabase-js refreshes it.
- **Development:** with `NEXT_PUBLIC_DEV_LOGIN=true`, the dev buttons fetch a 12-hour token from `POST /api/v1/dev/token`. The token is kept in `sessionStorage`.
- `GET /me` returns role keys. UI permissions come from the system role table in `src/lib/permissions.ts`, which mirrors `apps/api/src/auth/permissions.ts`, using the same matching rule (`*`, exact, `prefix:*`). Custom roles grant no UI permissions, because `/me` does not expose their permission strings. The API still honours them.
- A signed-in user with no recognised admin role sees a "No admin access" page. Every page also checks its own permission. Actions the user cannot perform are hidden: for example, pricing fields need `monetization:write`, wallet adjustment needs `wallet:adjust` and role assignment needs `roles:write`.
- A 401 from the API signs the user out.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on port 3001 |
| `npm run build` | Production build (standalone server in `.next/standalone`) |
| `npm start` | `next start` on port 3001 (non-Docker) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint with `eslint-config-next` (core-web-vitals and TypeScript) |
| `npm test` | Vitest, run once |
| `npm run test:watch` | Vitest in watch mode |

## Uploads

Posters, campaign creatives and episode videos are uploaded straight from the browser to storage, using a presigned `PUT` URL from the API. The browser sends the `headers` the API returns. Video uploads show progress through `XMLHttpRequest`, then call `POST /admin/video-assets/:id/complete` and poll the asset every 3 seconds until it is `READY` or `FAILED`.

The storage bucket must allow CORS `PUT` from the admin origin. Locally that is the S3 service from `infra/docker`; in production it is the Cloudflare R2 bucket. Without CORS, uploads fail with "network error or the storage bucket does not allow this origin".

## Ads and revenue

AdMob (Google network) revenue and direct-campaign revenue are always shown and labelled separately:

- Direct-campaign amounts are entered in rupees and sent as integer paise. The conversion in `src/lib/money.ts` uses no floating point.
- AdMob reports are pasted as CSV, parsed in the browser (`src/lib/admob-csv.ts`), previewed, then imported.
- The placements page shows Google's test ad unit IDs for development and the SSV callback URL to configure in AdMob (`https://api.<domain>/api/v1/ads/admob/ssv`).

## Docker

```bash
cd apps/admin
docker build -t reel-drama-admin \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=public-anon-key .
docker run -p 3001:3001 reel-drama-admin
```

The image is multi-stage (deps, build, runtime). It runs the standalone `server.js` as the unprivileged `nextjs` user (uid 1001) on port 3001. Because `NEXT_PUBLIC_*` values are build-time, build one image per environment.

## Layout

```
src/
  app/                  routes; (app)/ holds the guarded shell, login/ the sign-in page
  components/ui/        hand-written accessible primitives (button, form fields, dialog, tabs, table, toast, states)
  components/shell/     app shell (auth guard, sidebar, user menu) and nav
  features/<area>/      page components per area (dramas, media, users, ads, …)
  lib/                  api client, auth, permissions, schemas (Zod), money, AdMob CSV, upload, types
  test/                 Vitest setup and render helpers
```
