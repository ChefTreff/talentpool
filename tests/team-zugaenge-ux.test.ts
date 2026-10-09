import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * ADM-109 (Konrad 09.10.2026: „Team & Zugänge sieht super aus — Design bitte noch einmal für UX drüber“): die UX-Abnahme der Seite
 * (#446), Punkte 4 bis 11 der Befundliste. **Keine Funktions- und keine Rechteänderung**: die Server-Aktionen bleiben, ihre Tests
 * (`team-zugaenge-seite.test.ts`) laufen unverändert bis auf zwei Muster. Hier steht, was an der Gestalt neu ist.
 *
 * Es gibt keinen DOM-Testlauf im Repo: Quelltext hier, Messung und Bilder in der PR-Beschreibung.
 */

const ohneKommentare = (q: string) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const DIR = "app/(admin)/admin/verwaltung/zugaenge";
const lies = (n: string) => ohneKommentare(readFileSync(`${DIR}/${n}`, "utf8"));
const kopf = lies("ZugaengeKopf.tsx");
const liste = lies("ZugaengeListe.tsx");
const seite = lies("page.tsx");
const einladung = lies("TeamEinladung.tsx");
const geraet = lies("Geraetekonto.tsx");
const aufnehmen = lies("PersonAufnehmen.tsx");
const de = JSON.parse(readFileSync("lib/i18n/de.json", "utf8")).accessAdmin as Record<string, string>;
const en = JSON.parse(readFileSync("lib/i18n/en.json", "utf8")).accessAdmin as Record<string, string>;

describe("Die Formulare stehen im Schubfach, nicht als Karte unter der Leiste (Punkte 5 und 6)", () => {
  it("beide Aktionen öffnen ein `Drawer`: „Teammitglied hinzufügen“ und „Gerät anlegen“", () => {
    assert.match(kopf, /<Drawer open=\{offen === "hinzufuegen"\} onClose=\{zu\} title=\{t\.addMember\}/);
    assert.match(kopf, /<Drawer open=\{offen === "geraet"\} onClose=\{zu\} title=\{t\.openDevice\}/);
    assert.match(kopf, /aria-haspopup="dialog" onClick=\{\(\) => setOffen\("geraet"\)\}/);
    assert.match(kopf, /aria-haspopup="dialog" onClick=\{\(\) => setOffen\("hinzufuegen"\)\}/);
  });

  it("das Schubfach des Hinzufügens hat **zwei Wege** als Auswahlknöpfe — der zweite ist nicht mehr am Seitenende versteckt", () => {
    assert.match(kopf, /<Chip aktiv=\{weg === "einladen"\}/);
    assert.match(kopf, /<Chip aktiv=\{weg === "aufnehmen"\}/);
    assert.match(kopf, /\{weg === "einladen" \? einladung : aufnehmen\}/);
    assert.match(kopf, /role="group" aria-label=\{t\.wayLabel\}/);
    assert.doesNotMatch(seite, /<details/, "das zugeklappte Feld ganz unten ist weg");
    assert.match(seite, /aufnehmen=\{\s*<PersonAufnehmen/);
  });

  it("die drei Formulare haben keine eigene Karte mehr (Karte in Karte steht auf der Verbotsliste) und schließen das Schubfach nach dem Erfolg", () => {
    for (const [name, text] of [["TeamEinladung", einladung], ["Geraetekonto", geraet], ["PersonAufnehmen", aufnehmen]] as const) {
      assert.doesNotMatch(text, /<Card\b|<CardHeader\b/, `${name} ohne Karte`);
      assert.match(text, /const schliessen = useSchubfachSchliessen\(\);/, `${name} holt die Schließen-Funktion`);
      assert.match(text, /schliessen\(\);/, `${name} ruft sie nach dem Erfolg`);
    }
    assert.match(kopf, /export const useSchubfachSchliessen = \(\) => useContext\(SchubfachKontext\);/);
    assert.match(kopf, /<SchubfachKontext\.Provider value=\{zu\}>/);
  });

  it("ein Fehler steht in dem Formular, nicht als Toast (`PersonAufnehmen` toastete ihn)", () => {
    assert.doesNotMatch(aufnehmen, /toast\("error"/);
    assert.match(aufnehmen, /\{fehler && <p className="ct-small text-error-ink" role="alert">\{fehler\}<\/p>\}/);
    assert.match(einladung, /role="alert"/);
    assert.match(geraet, /role="alert"/);
  });

  it("die Server-Aktionen sind dieselben (keine Funktions- und keine Rechteänderung)", () => {
    assert.match(einladung, /ladeTeamEin\(vorname, nachname, email, gewaehlt, edition\)/);
    assert.match(geraet, /legeGeraetAn\(form\.label, form\.email, form\.edition\)/);
    assert.match(aufnehmen, /findPeople\(suche\.trim\(\)\)/);
    assert.match(aufnehmen, /grantTeamRole\(p\.id, rolle, scope === "edition" \? editionId : null\)/);
  });
});

describe("Die Liste: Fehler bleiben im Dialog (Punkt 4)", () => {
  it("scheitert eine Rückfrage, bleibt sie offen und zeigt die Meldung — geschlossen wird nur bei Erfolg", () => {
    const ausfuehren = liste.slice(liste.indexOf("function ausfuehren()"), liste.indexOf("function rolleVergeben()"));
    assert.match(ausfuehren, /if \(!res\.ok\) \{\s*setDialogFehler\(nachricht\(res\.key, res\.detail\)\);\s*return;\s*\}/);
    assert.ok(ausfuehren.indexOf("setDialogFehler(nachricht") < ausfuehren.indexOf("setFrage(null)"), "die Meldung kommt vor dem Schließen und bricht ab");
    assert.match(liste, /error=\{dialogFehler\}/);
  });

  it("das Fenster „Rolle ergänzen“ macht es ebenso (`Modal error`)", () => {
    const vergeben = liste.slice(liste.indexOf("function rolleVergeben()"), liste.indexOf("function rolleOeffnen"));
    assert.match(vergeben, /if \(!res\.ok\) \{\s*setRolleFehler\(nachricht\(res\.key, res\.detail\)\);\s*return;\s*\}/);
    assert.match(liste, /<Modal label=\{t\.addRoleTitle\} onCancel=\{[^\n]*\} error=\{rolleFehler\}>/);
  });

  it("kein Toast meldet mehr einen Fehler der Liste", () => {
    assert.doesNotMatch(liste, /toast\("error"/);
  });
});

describe("Die Liste: eine Aktion je Zeile, rechts, der Rest im ⋯-Menü (Punkte 2, 7, 9, 10)", () => {
  it("beide Menüs sind `kompakt` (nur ⋯); „Rolle ergänzen“ steht nicht mehr doppelt im Menü", () => {
    assert.equal((liste.match(/<Menu kompakt ton="hell"/g) ?? []).length, 1, "ein gemeinsames Menü für Aktiv und Ohne Login");
    const menue = liste.slice(liste.indexOf("<Menu kompakt"), liste.indexOf("</Menu>"));
    assert.ok(menue.includes("fragen(\"sperren\""), "der Ausschnitt ist das Menü der Zeile");
    assert.doesNotMatch(menue, /addRoleTitle|rolleOeffnen/, "„Rolle ergänzen“ gibt es schon in der Spalte Rollen");
    assert.match(liste, /label=\{`\$\{t\.actions\}: \$\{k\.name \?\? ""\}`\}/, "der Name der Zeile steckt im Namen des Auslösers");
  });

  it("die Aktionen stehen rechts in einer Zeile (`justify-end`), „Einladen“ und ⋯ nebeneinander", () => {
    assert.match(liste, /<div className="flex items-center justify-end gap-2">/);
  });

  it("ohne Eintrag gibt es kein Menü (eigener Zugang ohne Mail, Gesperrte)", () => {
    assert.match(liste, /\{!k\.blocked_at && \(k\.has_login \? Boolean\(k\.email\) \|\| !eigen : !eigen\) && \(/);
  });

  it("das Badge „Ohne Login“ bricht nicht mehr um; die Namen-Links haben am groben Zeiger 44 px", () => {
    assert.match(liste, /<Td label=\{t\.colAccess\} className="whitespace-nowrap">/);
    assert.match(liste, /className="ct-link inline-flex font-medium pointer-coarse:min-h-11 pointer-coarse:items-center"/);
  });

  it("die Funktionen der Zeile sind dieselben (Einladen, Sperren, Öffnen, Rolle entziehen und ergänzen, Selbstschutz)", () => {
    for (const art of ["oeffnen", "einladen", "sperren"]) assert.match(liste, new RegExp(`fragen\\("${art}"`), art);
    assert.match(liste, /art: "entziehen"/);
    assert.match(liste, /\{!eigen && <MenuItem onSelect=\{\(\) => fragen\("sperren", k\)\}>/);
  });
});

describe("Die Leiste am Handy und der Leerzustand (Punkte 8 und 11)", () => {
  it("die zwei Aktionen stehen am Handy gleich breit nebeneinander, ab 640 px rechts (nicht mit ungleichem Rand rechtsbündig)", () => {
    assert.match(kopf, /<div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto">/);
  });

  it("der Leerzustand trägt genau eine Aktion: bei einer Suche sie zurücksetzen, sonst alle zeigen", () => {
    assert.match(liste, /<EmptyState title=\{t\.empty\} description=\{t\.emptyBody\} action=\{leerAktion\} \/>/);
    assert.match(seite, /suche \? strings\.clearSearch : strings\.showAll/);
    assert.match(seite, /leerAktion=\{leerAktion\}/);
  });

  it("jeder neue Text steht in Deutsch und Englisch", () => {
    for (const k of ["addMember", "wayLabel", "wayInvite", "wayAdopt", "clearSearch", "showAll", "drawerClose"]) {
      assert.ok(de[k]?.trim(), `de.${k}`);
      assert.ok(en[k]?.trim(), `en.${k}`);
      assert.notEqual(de[k], en[k], `${k} ist übersetzt`);
    }
  });
});
