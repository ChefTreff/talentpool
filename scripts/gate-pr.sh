#!/bin/sh
# PR-Gate unabhängig vom Build-Worktree: frischer Git-Worktree, npm ci, lint, tsc, test, build.
# Aufruf: sh scripts/gate-pr.sh <branch>      (z. B. welle-1/rollen-org-scope)
# Turbopack akzeptiert kein symbolisch verlinktes node_modules, deshalb eine echte Installation.
set -eu
R="$(cd "$(dirname "$0")/.." && pwd)"
BR="${1:?Branch angeben}"
T="$(mktemp -d)/gate"
cleanup() { cd "$R"; git worktree remove --force "$T" >/dev/null 2>&1 || true; git worktree prune; }
trap cleanup EXIT
cd "$R"; git fetch -q origin "$BR"
git worktree add -q "$T" "origin/$BR"
[ -f "$R/.env.local" ] && cp "$R/.env.local" "$T/.env.local"
cd "$T"
npm ci --no-audit --no-fund >/dev/null 2>&1 || { echo "npm ci: FEHLER"; exit 1; }
npm run lint >/dev/null 2>&1 && echo "lint: ok" || { echo "lint: FEHLER"; npm run lint 2>&1 | tail -20; exit 1; }
# Typprüfung über alles inkl. tests/ — `npm test` entfernt Typen nur (strip-types), `next build` prüft tests/ nicht.
npx tsc --noEmit >/dev/null 2>&1 && echo "tsc: ok" || { echo "tsc: FEHLER"; npx tsc --noEmit 2>&1 | head -20; exit 1; }
out="$(npm test 2>&1)"; echo "$out" | grep -E "tests |pass |fail " | tr -s ' ' | tr '\n' ' '; echo
echo "$out" | grep -qE "fail 0" || { echo "test: FEHLER"; echo "$out" | tail -20; exit 1; }
npm run build >/dev/null 2>&1 && echo "build: ok" || { echo "build: FEHLER"; npm run build 2>&1 | grep -E -A6 "Build error|Error" | head -30; exit 1; }
echo "GATE GRÜN ($BR @ $(git rev-parse --short HEAD))"
