import io, re, sys
# Vereint Konfliktblöcke: beide Seiten behalten (ours, dann theirs), doppelte Zeilen innerhalb des Blocks nur einmal.
ERLAUBT = ("supabase/tests/README.md", "docs/feedback/", "docs/testdaten-konrad.md", "docs/team-testleitfaden.md")
pfad = sys.argv[1]
if not pfad.startswith(ERLAUBT):
    print(f"VERWEIGERT {pfad}"); sys.exit(3)
s = io.open(pfad, encoding="utf-8").read()
muster = re.compile(r"<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n", re.S)
n = 0
def ersatz(m):
    global n; n += 1
    ours = m.group(1).splitlines(keepends=True); theirs = m.group(2).splitlines(keepends=True)
    out = list(ours)
    for z in theirs:
        if z not in ours: out.append(z)
    return "".join(out)
s2 = muster.sub(ersatz, s)
assert "<<<<<<<" not in s2 and ">>>>>>>" not in s2 and "\n=======\n" not in s2, "Marker übrig"
io.open(pfad, "w", encoding="utf-8").write(s2)
print(f"vereint {pfad}: {n} Block/Blöcke")
