import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { geaenderteSchluessel, profilUmschalten, type Zielprofil } from "@/components/partner/profil";

/**
 * PART-128 Teil 2: `ProfilAuswahl` („Wen wünscht ihr euch?“ der Company Tour, „Wen sucht ihr?“ der Interview
 * Tables, dieselbe Maske unter der Organisation im Admin) benutzt den aufklappbaren Baustein statt 27 Kästchen
 * auf einmal. Die Schnittstelle `onToggle(feld, key)` bleibt — die Seiten ändern sich nicht. Es gibt keinen
 * DOM-Testlauf im Repo: hier steht, was am Quelltext und an der reinen Übersetzung feststehen muss; Öffnen und
 * Klicken sind im Browser gemessen (PR-Beschreibung).
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const ohneKommentare = (quelle: string) => quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const QUELLE = ohneKommentare(lies("components/partner/ProfilAuswahl.tsx"));

describe("Von der neuen Liste zum einen umgeschalteten Schlüssel", () => {
  it("dazugekommen: genau dieser Schlüssel", () => {
    assert.deepEqual(geaenderteSchluessel(["bwl"], ["bwl", "med"]), ["med"]);
    assert.deepEqual(geaenderteSchluessel([], ["bwl"]), ["bwl"]);
  });

  it("weggefallen: genau dieser Schlüssel", () => {
    assert.deepEqual(geaenderteSchluessel(["bwl", "med"], ["bwl"]), ["med"]);
    assert.deepEqual(geaenderteSchluessel(["bwl"], []), ["bwl"]);
  });

  it("dieselben Einträge in anderer Reihenfolge sind keine Änderung", () => {
    assert.deepEqual(geaenderteSchluessel(["med", "bwl"], ["bwl", "med"]), []);
    assert.deepEqual(geaenderteSchluessel([], []), []);
  });

  it("mehrere Unterschiede: erst die neuen, dann die weggefallenen", () => {
    assert.deepEqual(geaenderteSchluessel(["a", "b"], ["b", "c"]), ["c", "a"]);
  });

  it("zusammen mit `profilUmschalten` ergibt es wieder die Liste, die der Baustein gemeldet hat", () => {
    const fall: [string[], string[]][] = [[[], ["a"]], [["a"], ["a", "b"]], [["a", "b"], ["b"]], [["b"], []], [["a", "b"], ["b", "c"]]];
    for (const [alt, neu] of fall) {
      let profil: Zielprofil = alt.length > 0 ? { study_field: alt } : {};
      for (const key of geaenderteSchluessel(alt, neu)) profil = profilUmschalten(profil, "study_field", key);
      assert.deepEqual([...(profil.study_field ?? [])].sort(), [...neu].sort(), `${alt} → ${neu}`);
    }
  });

  it("die letzte Wahl entfernt das Feld ganz (nichts Leeres wird gespeichert)", () => {
    let profil: Zielprofil = { skill: ["programming"], study_field: ["bwl"] };
    for (const key of geaenderteSchluessel(["bwl"], [])) profil = profilUmschalten(profil, "study_field", key);
    assert.deepEqual(profil, { skill: ["programming"] });
  });
});

describe("ProfilAuswahl: je Frage eine aufklappbare Zeile", () => {
  it("jede der drei Fragen ist ein `Field` mit dem aufklappbaren Baustein (die Beschriftung benennt den Knopf)", () => {
    assert.match(QUELLE, /PROFIL_FELDER\.map\(\(feld\) => \{/);
    assert.match(QUELLE, /<Field key=\{feld\} label=\{t\[`profile_\$\{feld\}`\]\} htmlFor=\{`\$\{basis\}-\$\{feld\}`\}>/);
    assert.match(QUELLE, /<MehrfachAuswahl\s+aufklappbar\s+id=\{`\$\{basis\}-\$\{feld\}`\}/);
  });

  it("die Ids kommen aus `useId`: dieselbe Auswahl darf auf einer Seite zweimal stehen (zwei Tische, zwei Stopps)", () => {
    assert.match(QUELLE, /const basis = useId\(\);/);
  });

  it("nichts gewählt zeigt „Offen für alle“ aus dem Wörterbuch, gesperrt gibt der Aufrufer weiter", () => {
    assert.match(QUELLE, /leer=\{t\.profileOpen\}/);
    assert.match(QUELLE, /disabled=\{disabled\}/);
  });

  it("die Schnittstelle bleibt: `onToggle(feld, key)` je geändertem Schlüssel, Optionen aus `felder`", () => {
    assert.match(QUELLE, /for \(const key of geaenderteSchluessel\(gewaehlt, neu\)\) onToggle\(feld, key\);/);
    assert.match(QUELLE, /options=\{felder\[feld\]\.map\(\(o\) => \(\{ value: o\.key, label: o\.label \}\)\)\}/);
    assert.match(QUELLE, /onToggle: \(feld: ProfilFeld, key: string\) => void;/);
    assert.match(QUELLE, /export \{ PROFIL_FELDER, profilUmschalten, type ProfilFeld, type ProfilOption, type Zielprofil \} from "\.\/profil";/);
  });

  it("keine Kästchenwand mehr: kein rohes Kästchen, kein `fieldset`, keine feste Höhe von Hand", () => {
    assert.doesNotMatch(QUELLE, /type="checkbox"|<fieldset|<legend|min-h-11/);
  });

  it("die Seiten sind unverändert: Company Tour, Interview Tables (die Maske im Admin ist dieselbe Komponente wie die Company Tour)", () => {
    assert.match(lies("components/partner/TourStopp.tsx"), /<ProfilAuswahl\s+felder=\{felder\}\s+value=\{entwurf\.target_profile\}\s+onToggle=\{\(feld, key\) => set\("target_profile", profilUmschalten\(entwurf\.target_profile, feld, key\)\)\}/);
    assert.match(lies("app/(partner)/partner/interview-tables/TischeView.tsx"), /<ProfilAuswahl\s+felder=\{profilFelder\}\s+value=\{profil\}\s+onToggle=\{toggleProfil\}/);
  });
});

describe("Der Text „Offen für alle“ steht in beiden Gruppen, beiden Sprachen", () => {
  for (const sprache of ["de", "en"] as const) {
    it(`${sprache}: partnerTour und partnerInterviewTables tragen profileOpen`, () => {
      const dict = JSON.parse(lies(`lib/i18n/${sprache}.json`)) as Record<string, Record<string, string>>;
      for (const gruppe of ["partnerTour", "partnerInterviewTables"]) {
        assert.equal(typeof dict[gruppe].profileOpen, "string", `${sprache}: ${gruppe}.profileOpen`);
        assert.ok(dict[gruppe].profileOpen.length > 0);
      }
    });
  }

  it("auf Deutsch sagt er, was „nichts gewählt“ bedeutet — nicht „Keine Auswahl“", () => {
    const dict = JSON.parse(lies("lib/i18n/de.json")) as Record<string, Record<string, string>>;
    assert.equal(dict.partnerTour.profileOpen, "Offen für alle");
    assert.equal(dict.partnerInterviewTables.profileOpen, "Offen für alle");
  });
});
