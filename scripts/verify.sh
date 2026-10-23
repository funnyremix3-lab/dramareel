#!/usr/bin/env bash
# Runs every check in the monorepo. Exit code is non-zero if anything fails.
#   bash scripts/verify.sh            # everything
#   bash scripts/verify.sh api mobile # selected packages
# Integration tests need: docker compose -f infra/docker/docker-compose.yml up -d
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGETS="${*:-api transcoder notifications importer media-worker mobile admin}"
FAILED=()

run() { # name, dir, command...
  local name="$1" dir="$2"; shift 2
  [ -d "$ROOT/$dir" ] || { echo "skip $name (no $dir)"; return; }
  [ -f "$ROOT/$dir/package.json" ] || { echo "skip $name (no package.json)"; return; }
  echo "── $name: $*"
  if ! (cd "$ROOT/$dir" && eval "$@" > "/tmp/verify-$name.log" 2>&1); then
    FAILED+=("$name")
    echo "   ✗ FAILED — last lines:"; tail -25 "/tmp/verify-$name.log" | sed 's/^/     /'
  else
    echo "   ✓ ok"
  fi
}

for t in $TARGETS; do
  case "$t" in
    api)
      run api-typecheck apps/api "npx tsc --noEmit -p tsconfig.json"
      run api-unit apps/api "npm test --silent"
      if docker compose -f "$ROOT/infra/docker/docker-compose.yml" ps --status running 2>/dev/null | grep -q postgres; then
        run api-e2e apps/api "npm run test:e2e --silent"
      else
        echo "skip api-e2e (docker postgres not running)"
      fi ;;
    transcoder)
      run transcoder-typecheck workers/video-transcoder "npx tsc --noEmit -p tsconfig.json"
      run transcoder-unit workers/video-transcoder "npx jest" ;;
    notifications)
      run notifications-typecheck workers/notifications "npx tsc --noEmit -p tsconfig.json"
      run notifications-unit workers/notifications "npx jest" ;;
    importer)
      run importer-typecheck tools/drama-importer "npx tsc --noEmit -p tsconfig.json"
      run importer-unit tools/drama-importer "npx jest" ;;
    media-worker)
      run media-worker-typecheck infra/cloudflare/media-worker "npx tsc --noEmit"
      run media-worker-test infra/cloudflare/media-worker "npm test --silent" ;;
    mobile)
      run mobile-typecheck apps/mobile "npx tsc --noEmit"
      run mobile-lint apps/mobile "npx expo lint"
      run mobile-test apps/mobile "npx jest --ci" ;;
    admin)
      run admin-typecheck apps/admin "npx tsc --noEmit"
      run admin-lint apps/admin "npm run lint --silent"
      run admin-test apps/admin "npm test --silent" ;;
    *) echo "unknown target $t" ;;
  esac
done

if [ ${#FAILED[@]} -gt 0 ]; then
  echo; echo "FAILED: ${FAILED[*]}"; exit 1
fi
echo; echo "ALL CHECKS PASSED"
