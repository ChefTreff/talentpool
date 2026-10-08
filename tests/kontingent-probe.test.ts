import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const skript = readFileSync(new URL("../scripts/vivenu-sandbox-lauf.mjs", import.meta.url), "utf8");

/** Der Rumpf des Schritts `kontingent-probe`, bis zum nächsten Schritt. */
function schritt(): string {
  const start = skript.indexOf('async "kontingent-probe"() {');
  assert.ok(start >= 0, "Schritt kontingent-probe fehlt");
  const ende = skript.indexOf("/** Das Wegwerf-Ticket wieder entwerten. */", start);
  assert.ok(ende > start, "Ende des Schritts nicht gefunden");
  return skript.slice(start, ende);
}

/**
 * Der Schritt belegt für PART-111, ob der Undershop die Menge je Kategorie hält, wenn ein einziger Coupon
 * mehr erlaubt. Er läuft gegen die vivenu-Sandbox und schreibt dort — deshalb sind seine Regeln als Test
 * festgehalten: nur Sandbox, alles mit Präfix, Aufräumen auch nach einem Fehler, nichts Geheimes in der Ausgabe.
 */
describe("kontingent-probe: Regeln des Schritts (PART-111)", () => {
  const s = schritt();

  it("der Schritt steht in der Liste im Kopf des Skripts und heißt, wie Plan ihn aufruft", () => {
    assert.match(skript.slice(0, 1200), /kontingent-probe\s+# PART-111/);
  });

  it("läuft nur gegen die Sandbox — als erste Anweisung, vor jedem Aufruf", () => {
    const erste = s.slice(s.indexOf("{") + 1).trimStart();
    assert.match(erste, /^if \(!sandbox\) throw new Error\("kontingent-probe läuft nur gegen die Sandbox/);
  });

  it("alles, was er anlegt, trägt den Präfix ZZTEST: Undershop, Coupon und Code", () => {
    assert.match(s, /const shopName = `\$\{MARK\} Kontingent-Probe \$\{stempel\}`/);
    assert.match(s, /const code = `\$\{MARK\}-PROBE-/);
    assert.match(s, /name: `\$\{MARK\} Kontingent-Probe`/);
    assert.equal(skript.includes('const MARK = "ZZTEST";'), true);
  });

  it("die Tickettypen kommen aus dem Event und sind nie ein ZZTEST-Typ", () => {
    assert.match(s, /!String\(t\.name \?\? ""\)\.startsWith\(MARK\)/);
  });

  it("der Coupon erlaubt mehr, als die Zeilen hergeben — sonst belegte der Versuch den Coupon, nicht die Zeile", () => {
    const menge = (name: string) => Number(new RegExp(`const ${name} = (\\d+);`).exec(s)?.[1]);
    const a = menge("MENGE_A");
    const b = menge("MENGE_B");
    const coupon = menge("COUPON_MAX");
    assert.ok(a >= 1 && b >= 1, "beide Zeilen tragen Menge");
    assert.ok(coupon > a + b, `Coupon ${coupon} muss über der Summe ${a + b} liegen`);
    assert.match(s, /maxAmount: MENGE_A \+ MENGE_B/);
    assert.match(s, /allowedTickets: \[idA, idB\]/);
  });

  it("sechs Versuche: drei bis zur Grenze müssen durchgehen, drei darüber scheitern — die darüber isolieren Zeile A, Zeile B und die Summe", () => {
    const versuche = [...s.matchAll(/await versuch\("(\d)", (\[[^\n]+\]), (true|false)\);/g)].map((m) => ({ nr: m[1], wunsch: m[2], erwartet: m[3] }));
    assert.deepEqual(
      versuche.map((v) => [v.nr, v.erwartet]),
      [["1", "true"], ["2", "false"], ["3", "true"], ["4", "false"], ["5", "true"], ["6", "false"]],
    );
    // 2 und 4: ein Stück über der Zeile, die Summe des Shops und der Coupon ließen noch Platz.
    assert.match(versuche[1].wunsch, /\[\[idA, MENGE_A \+ 1\]\]/);
    assert.match(versuche[3].wunsch, /\[\[idB, MENGE_B \+ 1\]\]/);
    // Jeder Warenkorb wird sofort wieder abgebrochen, sonst verfälschte die Reservierung den nächsten Versuch.
    assert.match(s, /const frei = k \? ` · abgebrochen: \$\{await abbrechen\(k\)\}` : "";/);
  });

  it("räumt immer auf (finally): Warenkörbe abbrechen, Coupon mit vollem Satz abschalten, nur eigene Probe-Shops entfernen", () => {
    assert.match(s, /\} finally \{/);
    const aufraeumen = s.slice(s.indexOf("} finally {"));
    assert.match(aufraeumen, /for \(const k of offen\.filter\(\(x\) => !x\.erledigt\)\) abgebrochen\.push\(await abbrechen\(k\)\)/);
    assert.match(aufraeumen, /\{ \.\.\.couponFelder, active: false, maxTickets: 0, maxUsage: 0 \}/);
    // Konrads Undershops bleiben: entfernt wird nur, was mit dem Präfix der Probe beginnt.
    assert.match(aufraeumen, /!String\(s\.name \?\? ""\)\.startsWith\(`\$\{MARK\} Kontingent-Probe`\)/);
  });

  it("gibt nie Schlüssel, Geheimnisse oder Ids aus", () => {
    const ausgaben = s.split("\n").filter((z) => z.includes("console.log"));
    assert.ok(ausgaben.length > 5);
    for (const z of ausgaben) {
      assert.doesNotMatch(z, /secret|VIVENU_API_KEY|authorization|\._id|\.id\b/i, z.trim());
    }
    // Fehlertexte laufen durch `maskiere`, das 24-stellige Ids ersetzt.
    assert.match(s, /replace\(\/\[0-9a-f\]\{24\}\/gi, "<id>"\)/);
    // Das Geheimnis des Warenkorbs geht nur in den Abbruch, nie in eine Ausgabe.
    assert.match(s, /body: JSON\.stringify\(\{ secret: k\.secret \}\)/);
  });

  it("das Ergebnis sagt es ausdrücklich: JA nur, wenn jeder Versuch über der Zeilengrenze scheiterte", () => {
    assert.match(s, /const durchgesetzt = drueber\.length > 0 && drueber\.every\(\(r\) => !r\.ok\);/);
    assert.match(s, /Die Zeilengrenze je Kategorie wird durchgesetzt: JA/);
    assert.match(s, /NEIN oder nicht belegt/);
  });
});
