import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import {
  ZUSTAENDE,
  aktuellerStand,
  einwilligungenAdresse,
  leseAnsicht,
  leseZustand,
  zaehle,
} from "@/lib/einwilligungen/stand";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
type W = { consentsAdmin: Record<string, string> };
const de = JSON.parse(lies("lib/i18n/de.json")) as W;
const en = JSON.parse(lies("lib/i18n/en.json")) as W;

describe("Einwilligungen je Person (ADM-096)", () => {
  it("Ansicht und Zustand aus der Adresse: Standard ist die Person, Unbekanntes wird verworfen", () => {
    assert.equal(leseAnsicht(undefined), "person");
    assert.equal(leseAnsicht("eintrag"), "eintrag");
    assert.equal(leseAnsicht("bunt"), "person");
    for (const z of ZUSTAENDE) assert.equal(leseZustand(z), z);
    assert.equal(leseZustand("bunt"), "");
  });

  it("der aktuelle Stand ist der jüngste Eintrag je Art; ein Widerruf steht am Eintrag selbst", () => {
    const stand = aktuellerStand([
      { consent_type: "privacy", version: "v1", granted: true, granted_at: "2026-10-01T10:00:00Z", revoked_at: null },
      { consent_type: "privacy", version: "v2", granted: true, granted_at: "2026-10-08T10:00:00Z", revoked_at: null },
      { consent_type: "newsletter", version: "v1", granted: true, granted_at: "2026-10-02T10:00:00Z", revoked_at: "2026-10-05T10:00:00Z" },
      { consent_type: "photo_video", version: "v1", granted: false, granted_at: "2026-10-03T10:00:00Z", revoked_at: null },
    ]);
    assert.deepEqual(
      stand.map((s) => `${s.type}:${s.state}:${s.version}`),
      ["newsletter:revoked:v1", "photo_video:declined:v1", "privacy:granted:v2"],
    );
    assert.equal(stand[0].at, "2026-10-05T10:00:00Z", "bei einem Widerruf zählt der Zeitpunkt des Widerrufs");
    assert.deepEqual(zaehle(stand), { granted: 1, declined: 1, revoked: 1 });
    assert.deepEqual(aktuellerStand([]), []);
  });

  it("die Adresse trägt nur, was gesetzt ist", () => {
    const pfad = "/admin/verwaltung/einwilligungen";
    assert.equal(einwilligungenAdresse(pfad, { ansicht: "person" }), pfad);
    assert.equal(einwilligungenAdresse(pfad, { ansicht: "eintrag", typ: "newsletter", zustand: "revoked", q: "max", seite: 2 }),
      `${pfad}?ansicht=eintrag&typ=newsletter&zustand=revoked&q=max&seite=2`);
  });

  it("die Funktion prüft den Abschnitt, schneidet wie consent_current und hält die Suchwörter in der Klammer", () => {
    const sql = migrationText("v6_einwilligungen_je_person");
    assert.match(sql, /has_admin_section\('consents'\)/);
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /order by c\.person_id, c\.consent_type, c\.granted_at desc, c\.created_at desc, c\.id desc/);
    // Die Auswahl nach Art und Zustand und die Suchwörter müssen mit `and` verbunden sein, nicht mit `or`:
    // `A or B and C` bindet C nur an B (so stand es im ersten Entwurf).
    assert.match(sql, /where \(\(v_type is null and p_state is null\)[\s\S]*?\)\)\s+and not exists \(/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("die Seite liest über die Sitzung und kennt beide Sichten; die Personenseite zeigt Stand und Verlauf", () => {
    const seite = lies("app/(admin)/admin/verwaltung/einwilligungen/page.tsx");
    assert.match(seite, /consent_overview_admin/);
    assert.match(seite, /consent_records_admin/, "der Nachweis je Eintrag bleibt");
    assert.ok(!/createSupabaseAdminClient/.test(seite));
    const person = lies("app/(admin)/admin/personen/[id]/page.tsx");
    assert.match(person, /aktuellerStand\(/);
    assert.match(person, /EinwilligungsTabelle/);
  });

  it("alle Schlüssel der neuen Komponenten stehen in DE und EN", () => {
    const quellen = [
      "app/(admin)/admin/verwaltung/einwilligungen/EinwilligungenFilter.tsx",
      "app/(admin)/admin/verwaltung/einwilligungen/PersonenStandTabelle.tsx",
      "app/(admin)/admin/verwaltung/einwilligungen/page.tsx",
    ];
    for (const q of quellen) {
      const keys = new Set([...lies(q).matchAll(/\bt\.([a-zA-Z]+)\b/g)].map((m) => m[1]));
      for (const k of keys) {
        if (["meta", "admin", "common", "consentsAdmin"].includes(k)) continue;
        assert.ok(k in de.consentsAdmin, `${q}: de ${k}`);
        assert.ok(k in en.consentsAdmin, `${q}: en ${k}`);
      }
    }
    for (const k of ["leadPerson", "countPersons", "currentTitle", "historyTitle", "viewPerson", "viewEntry", "viewLabel"]) {
      assert.ok(de.consentsAdmin[k] && en.consentsAdmin[k], k);
    }
  });
});
