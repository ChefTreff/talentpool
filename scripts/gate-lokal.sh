#!/bin/bash
# Gate wie scripts/gate-pr.sh, aber auf einem vorhandenen Worktree (Integrationsbranch, bereits auf origin/main aufgesetzt).
R=/Users/konradgruner/Developer/talentpool; T="$1"; cd "$T" || exit 2
source "$HOME/.zshenv" 2>/dev/null
[ -f "$R/.env.local" ] && cp "$R/.env.local" "$T/.env.local"
git merge --no-edit -q origin/main >/dev/null 2>&1 || { echo "merge mit main: KONFLIKT"; git diff --name-only --diff-filter=U; exit 1; }
dups="$(git ls-files | grep -E ' [0-9]+\.[A-Za-z0-9]+$' || true)"; [ -z "$dups" ] || { echo "dateien: FEHLER (Duplikate)"; echo "$dups"; exit 1; }
badmig="$(git ls-files supabase/migrations | grep -vE '^supabase/migrations/[0-9]{14}_[a-z0-9_]+\.sql$' | grep -vE '/vorschlag/' || true)"; [ -z "$badmig" ] || { echo "dateien: FEHLER (Migration ohne Server-Version)"; echo "$badmig"; exit 1; }
platzhalter="$(git ls-files supabase/migrations | grep -E '^supabase/migrations/[0-9]{8}2359[0-9]{2}_' || true)"; [ -z "$platzhalter" ] || { echo "dateien: FEHLER (Platzhalter)"; exit 1; }
marker="$(git grep -lE '^(<<<<<<< |>>>>>>> )' -- . || true)"; [ -z "$marker" ] || { echo "dateien: FEHLER (Konfliktmarker)"; echo "$marker"; exit 1; }
if grep -rn "migrations/vorschlag/" tests --include="*.ts" | grep -v "tests/migration-datei.ts" >/dev/null 2>&1; then echo "dateien: FEHLER (Test liest vorschlag/ direkt)"; exit 1; fi
echo "dateien: ok"
npm ci --no-audit --no-fund >/dev/null 2>&1 || { echo "npm ci: FEHLER"; exit 1; }
audit="$(npm audit --omit=dev --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s).metadata.vulnerabilities;console.log(`${v.critical} kritisch, ${v.high} hoch, ${v.moderate} moderat`);process.exit(v.critical>0?2:0)})')" && echo "audit: $audit" || { echo "audit: FEHLER — $audit"; exit 1; }
npm run lint >/dev/null 2>&1 && echo "lint: ok" || { echo "lint: FEHLER"; npm run lint 2>&1 | tail -20; exit 1; }
npx tsc --noEmit >/dev/null 2>&1 && echo "tsc: ok" || { echo "tsc: FEHLER"; npx tsc --noEmit 2>&1 | head -20; exit 1; }
out="$(npm test 2>&1 || true)"; echo "$out" | grep -E "^ℹ (tests|pass|fail|skipped)" | tr '\n' ' '; echo
echo "$out" | grep -qE "fail 0" || { echo "test: FEHLER"; echo "$out" | grep -n '^✖\|^  ✖' | head -20; exit 1; }
npm run build >/dev/null 2>&1 && echo "build: ok" || { echo "build: FEHLER"; npm run build 2>&1 | grep -E -A6 "Build error|Error" | head -30; exit 1; }
echo "GATE GRÜN (plan/welle-1010 @ $(git rev-parse --short HEAD))"
