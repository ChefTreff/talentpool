#!/bin/bash
# Wellen-Merge (10.10.2026, Konrads Freigabe für Doku-Konflikte): Integrations-Worktree aus origin/main, PR-Branches der Reihe nach hineinmergen,
# reine Doku-Konflikte (README der DB-Tests, docs/feedback, Testdaten-Doku, Testleitfaden) mit scripts/welle-vereinen.py vereinen; Code-Konflikt = Abbruch.
# Danach doppelte Backlog-Zeilen zusammenführen, scripts/gate-lokal.sh <worktree> fahren, Migrationen anwenden, main per --ff-only vorschieben.
# Nutzung: bash scripts/welle-merge.sh <worktree> scripts/welle-vereinen.py <branch>...
W="$1"; V="$2"; shift 2
cd "$W" || exit 2
# offene Konflikte eines vorigen Laufs zuerst
if git diff --name-only --diff-filter=U | grep -q .; then
  while IFS= read -r f; do python3 -I "$V" "$f" >/dev/null || { echo "FEHLER vereinen $f"; exit 3; }; git add -- "$f"; done < <(git diff --name-only --diff-filter=U)
  git -c core.editor=true commit -q --no-edit && echo "VEREINT (Rest des vorigen Laufs)"
fi
for b in "$@"; do
  if git merge -q --no-edit "origin/$b" >/dev/null 2>&1; then echo "OK      $b"; continue; fi
  IFS=$'\n' read -r -d '' -a k < <(git diff --name-only --diff-filter=U; printf '\0')
  bad=0
  for f in "${k[@]}"; do
    case "$f" in supabase/tests/README.md|docs/feedback/*|docs/testdaten-konrad.md|docs/team-testleitfaden.md) ;; *) bad=1;; esac
  done
  if [ $bad = 1 ]; then git merge --abort; echo "ABBRUCH $b — Code-Konflikt in: ${k[*]}"; continue; fi
  for f in "${k[@]}"; do python3 -I "$V" "$f" >/dev/null || { echo "FEHLER vereinen $f"; exit 3; }; git add -- "$f"; done
  git -c core.editor=true commit -q --no-edit && echo "VEREINT $b — ${k[*]}"
done
echo "--- Marker: $(grep -rl '^<<<<<<<\|^>>>>>>>' docs supabase/tests app lib components 2>/dev/null | wc -l | tr -d ' ') Dateien; Commits über main: $(git log --oneline origin/main..HEAD | wc -l | tr -d ' ')"
