#!/bin/sh
# Merge eines geprüften PRs durch die Architektur-Session (24.09.2026).
#   sh scripts/merge-pr.sh <nr> [<gate-log>]
# Prüft: PR offen, kein Draft, mergeable, (optional) Gate-Log GRÜN für genau den Kopf-Commit;
# merged per Merge-Commit, prüft state=MERGED, löscht den Branch nur, wenn kein offener PR ihn als Basis hat,
# zieht main per ff-only. Bricht bei jeder Abweichung mit Meldung ab — nichts wird stillschweigend übersprungen.
set -eu
command -v gh >/dev/null 2>&1 || . "$HOME/.zshenv"
n="$1"; log="${2:-}"
json="$(gh pr view "$n" --json state,isDraft,mergeable,mergeStateStatus,headRefName,headRefOid)"
state="$(printf '%s' "$json" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).state')"
draft="$(printf '%s' "$json" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).isDraft')"
br="$(printf '%s' "$json" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).headRefName')"
sha="$(printf '%s' "$json" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).headRefOid')"
[ "$state" = "OPEN" ] || { echo "#$n ist $state — nichts zu tun"; exit 1; }
[ "$draft" = "false" ] || { echo "#$n ist noch Draft — erst wenn der Chat ihn fertig meldet"; exit 1; }
if [ -n "$log" ]; then
  grep -q "GATE GRÜN" "$log" || { echo "Gate-Log $log ist nicht grün"; exit 1; }
  grep -q "$(printf '%s' "$sha" | cut -c1-7)" "$log" || { echo "Gate-Log gehört nicht zu Kopf-Commit $sha (neuer Push nach dem Gate?)"; exit 1; }
fi
i=0
while [ $i -lt 8 ]; do
  m="$(gh pr view "$n" --json mergeable --jq .mergeable)"
  [ "$m" = "MERGEABLE" ] && break
  [ "$m" = "CONFLICTING" ] && { echo "#$n hat Konflikte mit main — im Worktree auflösen"; exit 1; }
  i=$((i+1)); sleep 5
done
[ "$m" = "MERGEABLE" ] || { echo "#$n mergeable=$m (unklar) — später erneut"; exit 1; }
gh pr merge "$n" --merge
[ "$(gh pr view "$n" --json state --jq .state)" = "MERGED" ] || { echo "#$n nach dem Merge nicht MERGED"; exit 1; }
echo "#$n gemergt ($br @ $(printf '%s' "$sha" | cut -c1-7))"
if [ -z "$(gh pr list --base "$br" --json number --jq '.[].number')" ]; then
  git push -q origin --delete "$br" && echo "Branch $br gelöscht"
else
  echo "Branch $br bleibt: offener PR hat ihn als Basis"
fi
git pull -q --ff-only origin main && echo "main: $(git log --oneline -1)"
