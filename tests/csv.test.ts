import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { csvCell, csvCellMinimal, csvSafe } from "@/lib/csv";

/**
 * Der Schutz gegen Formelauswertung ist unsichtbar, solange ihn niemand
 * angreift — genau deshalb steht er hier als Test. Wer `csvSafe` für
 * überflüssig hält und entfernt, bekommt rote Zeilen statt einer stillen
 * Lücke (Befund der Architektur-Session an #81, 18.09.2026).
 */
describe("CSV: Formelanfänge entschärfen", () => {
  it("setzt ein Leerzeichen vor die vier gefährlichen Zeichen", () => {
    for (const roh of ['=HYPERLINK("http://x","klick")', "+1+1", "-2+3", "@SUM(A1:A9)"]) {
      const raus = csvSafe(roh);
      assert.equal(raus, ` ${roh}`, `nicht entschärft: ${roh}`);
      assert.ok(!/^[=+\-@]/.test(raus), `beginnt weiter mit Formelzeichen: ${raus}`);
    }
  });

  it("entschärft auch Tabulator und Wagenrücklauf am Anfang", () => {
    assert.equal(csvSafe("\t=1+1"), " \t=1+1");
    assert.equal(csvSafe("\r=1+1"), " \r=1+1");
  });

  it("lässt reine Zahlen unberührt — auch negative", () => {
    // Ein Leerzeichen vor `-5` machte aus einer Zahl Text und verfälschte
    // stillschweigend jede Summe in der Tabelle.
    assert.equal(csvSafe("-5"), "-5");
    assert.equal(csvSafe("-5,5"), "-5,5");
    assert.equal(csvSafe("42"), "42");
    assert.equal(csvSafe(2), "2");
  });

  it("hält Telefonnummern lesbar", () => {
    // `+49 …` ist der Grund für das Leerzeichen statt eines Apostrophs: die
    // Nummer bleibt als Nummer erkennbar.
    assert.equal(csvSafe("+49 40 123456"), " +49 40 123456");
  });

  it("lässt harmlosen Text in Ruhe", () => {
    assert.equal(csvSafe("Hotel Grand Elysée"), "Hotel Grand Elysée");
    assert.equal(csvSafe("Mia Lohmeier"), "Mia Lohmeier");
    assert.equal(csvSafe(""), "");
    assert.equal(csvSafe(null), "");
    assert.equal(csvSafe(undefined), "");
  });
});

describe("CSV: Zelle", () => {
  it("verdoppelt Anführungszeichen und klammert immer", () => {
    assert.equal(csvCell('sagt "hallo"'), '"sagt ""hallo"""');
    assert.equal(csvCell("ohne"), '"ohne"');
  });

  it("entschärft **und** klammert — der Formelanfang darf nicht durchrutschen", () => {
    assert.equal(csvCell("=1+1"), '" =1+1"');
  });

  it("überlebt Semikolon und Zeilenumbruch im Wert", () => {
    // Beides würde die Zeile sonst zerreissen; deshalb immer Anführungszeichen.
    assert.equal(csvCell("a;b"), '"a;b"');
    assert.equal(csvCell("a\nb"), '"a\nb"');
  });

  it("ignoriert die Zusatzargumente von Array.map", () => {
    // Die Routen übergeben `csvCell` als Referenz an `map`, das drei Argumente
    // liefert. Käme der Index mit an, stünde er in der Datei.
    assert.deepEqual(["a", "=b"].map(csvCell), ['"a"', '" =b"']);
  });
});

describe("CSV: Zelle mit bedingter Klammerung", () => {
  it("lässt harmlose Werte ungeklammert — die Form der Datei bleibt", () => {
    // Der Volunteer-Export sieht seit Monaten so aus; der Empfänger hat sich
    // daran gewöhnt. Der Schutz darf das nicht nebenbei ändern.
    assert.equal(csvCellMinimal("Mia Lohmeier"), "Mia Lohmeier");
    assert.equal(csvCellMinimal(3), "3");
    assert.equal(csvCellMinimal(null), "");
  });

  it("klammert weiterhin bei Anführungszeichen, Semikolon und Umbruch", () => {
    assert.equal(csvCellMinimal('sagt "hallo"'), '"sagt ""hallo"""');
    assert.equal(csvCellMinimal("a;b"), '"a;b"');
    assert.equal(csvCellMinimal("a\nb"), '"a\nb"');
  });

  it("klammert einen entschärften Wert **immer**", () => {
    // Sonst könnte ein Leser, der führende Leerzeichen wegschneidet, die
    // Formel zurückbekommen, die wir gerade entschärft haben.
    assert.equal(csvCellMinimal("=1+1"), '" =1+1"');
    assert.equal(csvCellMinimal("@SUM(A1)"), '" @SUM(A1)"');
  });
});
