---
name: build-test-loop
description: Continuous build → test → fix → commit loop for the Reel Drama monorepo. Use when asked to "keep building", "loop", "don't stop", or to continue the next item in docs/TASKS.md. Picks the next unchecked task, implements it, runs scripts/verify.sh, fixes failures, commits, and repeats.
---

# Build-test loop

Work through `docs/TASKS.md` one item at a time, never leaving the repo broken.

## Each iteration
1. **Pick** the first unchecked `- [ ]` item in `docs/TASKS.md`. If it is too big for one commit, split it into sub-items in the file first.
2. **Read before writing.** Check the code it touches, and `docs/architecture.md`, `docs/api.md` or `docs/database.md` for the contract. For Expo or React Native APIs, read the installed package's type definitions (`node_modules/<pkg>/...d.ts`). Never assume an API from memory (see `apps/mobile/AGENTS.md`).
3. **Implement** in the surrounding style: same naming, comment density and error envelope. Write tests alongside the code:
   - pure logic → unit tests
   - API behaviour → `apps/api/test/*.e2e-spec.ts`
4. **Verify:** `bash scripts/verify.sh <targets>` for the packages touched (`api transcoder media-worker mobile admin`).
   - Integration tests need `docker compose -f infra/docker/docker-compose.yml up -d`. Start it if needed.
   - Fix failures at the root cause. Do not weaken or skip a test to make it pass.
   - Never run `prisma migrate reset` or other destructive database commands. Tests use the `reeldrama_test` database through migrate deploy + idempotent seed.
5. **Commit** with a message describing what changed and why, ending with the Co-Authored-By line. Never commit `.env*` files (except `.env.example`) or credentials.
6. **Update** `docs/TASKS.md`: tick the item and add any follow-ups you found. Update the README, docs and `.env.example` files when behaviour or configuration changed.
7. **Report** to the user in one or two Hinglish lines what was finished, then start the next iteration without waiting.

## Stop only when
- every item in `docs/TASKS.md` is checked and `bash scripts/verify.sh` passes, or
- the next step needs something only the user can provide: credentials, store or console access, a paid account, or a product decision. In that case list exactly what is needed and continue with any other unblocked items first.

## Guardrails
- Payments stay behind `PAYMENTS_ENABLED=false`. Rewards are granted only through server verification (SSV). Use Google **test** ad units only.
- Never use BytePlus demo services or credentials.
- Keep the Apache-2.0 attribution for BytePlus-derived files.
- Secrets live only in git-ignored `.env` files.
