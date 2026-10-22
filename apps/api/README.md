# Reel Drama API

NestJS 11 + Prisma 6 + PostgreSQL. The contract is in [docs/api.md](../../docs/api.md) and the schema in [docs/database.md](../../docs/database.md).

## Setup
```bash
cd apps/api
cp .env.example .env          # fill in DATABASE_URL etc.
npm install                   # also runs prisma generate
npm run db:migrate:deploy     # apply migrations
npm run db:seed               # fictional dramas + dev accounts (refuses in production)
npm run dev                   # http://localhost:3000/api/v1, Swagger at /api/docs
```

## Dev sign-in without Supabase
With `DEV_JWT_SECRET` set (32+ characters, never in production):
```bash
npm run dev:token -- viewer          # viewer@dev.local (100 coins)
npm run dev:token -- owner 24h       # owner@dev.local, 24 h token
curl -H "Authorization: Bearer $(npm run -s dev:token -- viewer)" localhost:3000/api/v1/me
```
Seeded accounts: `owner`, `content`, `ads`, `support`, `viewer`. Real users sign in through Supabase Auth; the API verifies their tokens via `SUPABASE_JWKS_URL`.

## Tests
```bash
npm test                      # unit tests, no DB
docker compose -f ../../infra/docker/docker-compose.yml up -d postgres
npm run test:e2e              # integration tests against reeldrama_test on :54329
```
Integration tests never read `.env`. They use `TEST_DATABASE_URL`, which defaults to the local Docker database, and they refuse to run against any database whose name lacks "test".

## Layout
| Path | Purpose |
|---|---|
| `src/auth` | JWT verification (Supabase JWKS / legacy HS256 / dev issuer), global guard, permissions |
| `src/users` | `/me`, profile, consents, device tokens, deletion requests |
| `src/catalog` | Home rails, feed, categories, drama list/search/detail, episodes with lock flags |
| `src/entitlements` | `evaluateAccess`, the single rule that decides who may watch what |
| `src/common` | Error filter and codes, cursor pagination, locale, media URLs, Prisma |
| `prisma/` | Schema, migrations, seed |
