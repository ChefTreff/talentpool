import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { eventBeginn, ZEITZONE } from "@/lib/side-event/zeit";

/**
 * Hotfix 08.10.2026: `/side-event/<token>` antwortete auf Produktion mit **500**, weil die Seite einen
 * `Intl.DateTimeFormat` mit `dateStyle`, `timeStyle` **und** `timeZoneName` baute — diese Mischung wirft seit Node 24
 * `TypeError: Invalid option : option`. Die Tests von #364 lasen den Quelltext der Seite und führten den Aufruf nie aus.
 * Dieser Test führt die Formatierung aus (unter derselben Node-Version wie das Gate und die Laufzeit) und sucht das ganze Repo
 * nach derselben Mischung ab.
 */
describe("Side Events: die Zeitangabe der öffentlichen Seite", () => {
  it("läuft (kein TypeError) und nennt Datum, Uhrzeit in Berliner Zeit und die Zone — Sommer und Winter", () => {
    for (const sprache of ["de-DE", "en-GB"]) {
      const sommer = eventBeginn(sprache, "2027-04-16T17:00:00+00:00");
      assert.match(sommer, /2027/, sprache);
      assert.match(sommer, /19:00/, `${sprache}: 17:00 UTC ist im April 19:00 in Berlin — ${sommer}`);
      assert.match(sommer, /MESZ|CEST/, sprache);
      const winter = eventBeginn(sprache, "2027-01-15T17:00:00Z");
      assert.match(winter, /18:00/, `${sprache}: im Januar 18:00 — ${winter}`);
      assert.match(winter, /MEZ|CET/, sprache);
    }
    assert.equal(ZEITZONE, "Europe/Berlin");
  });

  it("die Sprache bestimmt die Schreibweise: deutscher Monat auf Deutsch, englischer auf Englisch", () => {
    assert.match(eventBeginn("de-DE", "2027-04-16T17:00:00Z"), /April/);
    assert.match(eventBeginn("de-DE", "2027-04-16T17:00:00Z"), /Freitag/);
    assert.match(eventBeginn("en-GB", "2027-04-16T17:00:00Z"), /Friday/);
  });

  it("ein unlesbares Datum ergibt einen leeren Text statt eines Fehlers", () => {
    for (const kaputt of ["", "kaputt", "2027-13-45", "NaN"]) assert.equal(eventBeginn("de-DE", kaputt), "", kaputt);
  });

  it("die Seite benutzt diese Funktion und baut keinen eigenen Formatierer mit Zonenangabe", () => {
    const seite = readFileSync(new URL("../app/side-event/[token]/page.tsx", import.meta.url), "utf8");
    assert.match(seite, /import \{ eventBeginn \} from "@\/lib\/side-event\/zeit";/);
    assert.match(seite, /eventBeginn\(t\.meta\.dateLocale, e\.starts_at\)/);
    assert.doesNotMatch(seite, /DateTimeFormat/);
  });
});

/**
 * Der Wächter: `dateStyle`/`timeStyle` vertragen sich nicht mit Einzeloptionen. Gesucht wird in `Intl.DateTimeFormat(…, { … })` und in
 * `toLocaleString`/`toLocaleDateString`/`toLocaleTimeString` mit einem Optionsobjekt im Quelltext; eine Mischung steht dann mit Datei und
 * Zeile in der Fehlermeldung.
 */
describe("Datumsformate im ganzen Repo: keine Mischung aus Stil und Einzeloptionen", () => {
  const EINZEL = [
    "weekday", "era", "year", "month", "day", "dayPeriod", "hour", "minute", "second",
    "fractionalSecondDigits", "timeZoneName", "hour12", "hourCycle",
  ];
  const AUSGELASSEN = new Set(["node_modules", ".next", ".git", "supabase", "docs"]);

  function dateien(ordner: string, gefunden: string[] = []): string[] {
    for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
      if (AUSGELASSEN.has(eintrag.name)) continue;
      const pfad = join(ordner, eintrag.name);
      if (eintrag.isDirectory()) dateien(pfad, gefunden);
      else if (/\.(ts|tsx|mjs|cjs)$/.test(eintrag.name)) gefunden.push(pfad);
    }
    return gefunden;
  }

  /** Die Mischungen eines Quelltexts als „Zeile: Stil + Einzeloptionen“. */
  function mischungen(quelltext: string): string[] {
    const treffer: string[] = [];
    const re = /(?:DateTimeFormat|toLocale(?:Date|Time)?String)\(\s*[^,()]*(?:\([^)]*\))?[^,()]*,\s*\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(quelltext))) {
      const schluessel = [...m[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1]);
      const stil = schluessel.filter((k) => k === "dateStyle" || k === "timeStyle");
      const einzel = schluessel.filter((k) => EINZEL.includes(k));
      if (stil.length > 0 && einzel.length > 0) {
        treffer.push(`Zeile ${quelltext.slice(0, m.index).split("\n").length}: ${stil.join("+")} mit ${einzel.join("+")}`);
      }
    }
    return treffer;
  }

  it("der Wächter erkennt die Mischung, die am 08.10.2026 die Seite zum Absturz brachte — und lässt die erlaubten Formen durch", () => {
    assert.deepEqual(mischungen(`new Intl.DateTimeFormat(l, { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Berlin", timeZoneName: "short" })`), [
      "Zeile 1: dateStyle+timeStyle mit timeZoneName",
    ]);
    assert.equal(mischungen(`new Intl.DateTimeFormat(l, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" })`).length, 0);
    assert.equal(mischungen(`new Intl.DateTimeFormat(l, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })`).length, 0);
    assert.equal(mischungen(`d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })`).length, 0);
    assert.deepEqual(mischungen(`d.toLocaleString(sprache, { dateStyle: "short", hour: "2-digit" })`), ["Zeile 1: dateStyle mit hour"]);
    // der Formatierer gilt auch dann, wenn die Sprache ein Aufruf ist
    assert.deepEqual(mischungen(`new Intl.DateTimeFormat(sprache(x), { timeStyle: "short", month: "long" })`), ["Zeile 1: timeStyle mit month"]);
  });

  it("keine Datei in app, lib, components, scripts und tests mischt Stil und Einzeloptionen", () => {
    const wurzel = new URL("..", import.meta.url).pathname;
    const funde: string[] = [];
    for (const ordner of ["app", "lib", "components", "scripts", "tests"]) {
      for (const datei of dateien(join(wurzel, ordner))) {
        // diese Datei beschreibt die Mischung im Klartext — sie ist der Wächter selbst
        if (datei.endsWith("tests/side-event-zeit.test.ts")) continue;
        for (const fund of mischungen(readFileSync(datei, "utf8"))) funde.push(`${datei.slice(wurzel.length)} ${fund}`);
      }
    }
    assert.deepEqual(funde, [], `Diese Formatierer werfen zur Laufzeit (TypeError: Invalid option):\n${funde.join("\n")}`);
  });
});
