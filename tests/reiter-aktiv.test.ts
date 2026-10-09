import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { reiterAktiv } from "@/components/layout/reiter-aktiv";

/**
 * Wann ist ein Reiter der `SectionTabs` aktiv (QS-059, QS-079)? Die Fälle als Verhalten, nicht als Quelltext — der Fehler, den Design am 09.10.2026
 * beim Nachmessen fand (ein Reiter nur mit Abfrage war immer aktiv, weil `pathname.startsWith("/")` immer wahr ist), steht unten als eigener Test.
 */
describe("Reiter: `aktiv` gilt vor allem", () => {
  it("die Seite sagt es — der Pfad zählt dann nicht", () => {
    assert.equal(reiterAktiv({ href: "/a", aktiv: true }, "/b"), true);
    assert.equal(reiterAktiv({ href: "/a", aktiv: false }, "/a"), false);
    assert.equal(reiterAktiv({ href: "?bereich=dateien", aktiv: true }, "/admin/medien"), true);
    assert.equal(reiterAktiv({ href: "/a", exact: true, aktiv: false }, "/a"), false);
  });
});

describe("Reiter: nach dem Pfad", () => {
  it("ohne `exact`: der Pfad und alles darunter, nicht ein Pfad mit gleichem Anfang", () => {
    const r = { href: "/admin/partner" };
    assert.equal(reiterAktiv(r, "/admin/partner"), true);
    assert.equal(reiterAktiv(r, "/admin/partner/bestellungen"), true);
    assert.equal(reiterAktiv(r, "/admin/partnerinnen"), false, "kein Präfix ohne Schrägstrich");
    assert.equal(reiterAktiv(r, "/admin"), false);
  });

  it("`exact`: nur der Pfad selbst", () => {
    const r = { href: "/admin/partner", exact: true };
    assert.equal(reiterAktiv(r, "/admin/partner"), true);
    assert.equal(reiterAktiv(r, "/admin/partner/bestellungen"), false);
  });

  it("`exact` mit `detailPattern`: auch die Detailseite markiert den Reiter ihrer Liste", () => {
    const r = { href: "/admin/speaker", exact: true, detailPattern: "^/admin/speaker/[0-9a-f-]+$" };
    assert.equal(reiterAktiv(r, "/admin/speaker"), true);
    assert.equal(reiterAktiv(r, "/admin/speaker/3f2a-91bc"), true);
    assert.equal(reiterAktiv(r, "/admin/speaker/neu"), false);
    assert.equal(reiterAktiv({ href: "/admin/speaker", exact: true }, "/admin/speaker/3f2a"), false, "ohne Muster keine Detailseite");
  });
});

describe("Reiter: eine Abfrage im Ziel gehört nicht zum Pfad (QS-079)", () => {
  it("die Sichten der Masterclass bleiben mit `?instanz=` aktiv — und nur die eigene", () => {
    const inhalt = { href: "/partner/masterclass?instanz=a", exact: true };
    const bewerbungen = { href: "/partner/masterclass/bewerbungen?instanz=a" };
    assert.equal(reiterAktiv(inhalt, "/partner/masterclass"), true);
    assert.equal(reiterAktiv(inhalt, "/partner/masterclass/bewerbungen"), false, "Inhalt ist `exact`");
    assert.equal(reiterAktiv(bewerbungen, "/partner/masterclass/bewerbungen"), true);
    assert.equal(reiterAktiv(bewerbungen, "/partner/masterclass"), false);
    assert.equal(reiterAktiv(bewerbungen, "/partner/masterclass/fragen"), false);
  });

  it("ein Fragezeichen im Ziel ändert den Vergleich nicht, auch nicht mit mehreren Angaben", () => {
    assert.equal(reiterAktiv({ href: "/x?a=1&b=2", exact: true }, "/x"), true);
    assert.equal(reiterAktiv({ href: "/x?a=1&b=2", exact: true }, "/x?a=1&b=2"), false, "der Pfadname trägt nie eine Abfrage");
  });
});

describe("Reiter: eine Adresse nur mit Abfrage hat keinen Pfad", () => {
  it("ohne `aktiv` ist so ein Reiter nie aktiv — nicht auf der Startseite, nicht auf einer Unterseite", () => {
    for (const pfad of ["/", "/partner", "/partner/masterclass", "/partner/masterclass/bewerbungen"]) {
      assert.equal(reiterAktiv({ href: "?instanz=a" }, pfad), false, `href ?instanz=a bei ${pfad}`);
      assert.equal(reiterAktiv({ href: "?instanz=a", exact: true }, pfad), false, `exact bei ${pfad}`);
    }
    assert.equal(reiterAktiv({ href: "" }, "/partner"), false, "auch ein leeres Ziel nicht");
  });

  it("mit `aktiv` gilt, was die Seite sagt — der Weg, auf dem der Umschalter der Masterclass arbeitet", () => {
    assert.equal(reiterAktiv({ href: "?instanz=a", aktiv: true }, "/partner/masterclass"), true);
    assert.equal(reiterAktiv({ href: "?instanz=b", aktiv: false }, "/partner/masterclass"), false);
  });
});

describe("Reiter: Wurzel", () => {
  it("der Pfad `/` ist nur auf `/` aktiv — wie bisher, auch ohne `exact`", () => {
    assert.equal(reiterAktiv({ href: "/" }, "/"), true);
    assert.equal(reiterAktiv({ href: "/" }, "/partner"), false);
    assert.equal(reiterAktiv({ href: "/", exact: true }, "/partner"), false);
  });
});
