import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import de from "@/lib/i18n/de.json" with { type: "json" };
import en from "@/lib/i18n/en.json" with { type: "json" };

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ohneKommentare = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const KOMPONENTE = "components/partner/LogoWandEinwilligung.tsx";
const WIZARD = "app/(partner)/partner/onboarding/OnboardingWizard.tsx";
const PARTNER_SEITE = "app/(partner)/partner/onboarding/page.tsx";
const ORG_DETAIL = "app/(admin)/admin/partner/[org]/OrgDetail.tsx";
const ADMIN_SEITE = "app/(admin)/admin/partner/[org]/page.tsx";

/**
 * PART-105 (Konrad 05.10.): „Logo-Seite funktioniert nicht.“ Ursache: die Karte
 * „Logo auf der Foto-Wand“ bekam `t.logoWall` — in `partner` und `adminPartner` gibt es
 * diesen Schlüssel nicht (nur die Gruppe `logoWall` der Admin-Liste, ohne die Texte der
 * Einwilligung). Der Cast `as unknown as Record<string, string>` verdeckte das, die Karte las
 * `undefined.title` und stürzte ab — mit ihr der Logo-Schritt im Onboarding und die
 * Organisationsseite im Admin.
 */
describe("Einwilligung zum Weißen: die Texte kommen an (PART-105)", () => {
  const gelesen = [...new Set([...ohneKommentare(src(KOMPONENTE)).matchAll(/\bt\.([a-zA-Z]+)\b/g)].map((m) => m[1]))].sort();

  it("die Komponente liest dreizehn Texte, und der Typ nennt genau diese", () => {
    assert.equal(gelesen.length, 13, gelesen.join(", "));
    const typ = src(KOMPONENTE).slice(src(KOMPONENTE).indexOf("export type LogoWandTexte"));
    const deklariert = [...typ.slice(0, typ.indexOf("};")).matchAll(/^\s+([a-zA-Z]+): string;/gm)].map((m) => m[1]).sort();
    assert.deepEqual(deklariert, gelesen);
  });

  it("jeder gelesene Text steht in beiden Wörterbüchern und ist nicht leer", () => {
    for (const [sprache, gruppe] of [["de", de.logoWandEinwilligung], ["en", en.logoWandEinwilligung]] as const) {
      for (const key of gelesen) {
        const wert = (gruppe as Record<string, string>)[key];
        assert.ok(typeof wert === "string" && wert.trim().length > 0, `${sprache}.logoWandEinwilligung.${key} fehlt`);
      }
    }
    assert.deepEqual(Object.keys(de.logoWandEinwilligung).sort(), Object.keys(en.logoWandEinwilligung).sort());
    assert.match(de.logoWandEinwilligung.grantedOn, /\{date\}/);
    assert.match(en.logoWandEinwilligung.grantedOn, /\{date\}/);
  });

  it("Onboarding und Admin geben der Karte die eigene Gruppe, nicht mehr `t.logoWall` per Cast", () => {
    for (const datei of [WIZARD, ORG_DETAIL]) {
      const q = ohneKommentare(src(datei));
      assert.match(q, /t=\{einwilligung\}/, datei);
      assert.doesNotMatch(q, /\bt\.logoWall\b/, `${datei} liest noch t.logoWall`);
    }
    assert.match(ohneKommentare(src(PARTNER_SEITE)), /einwilligung=\{t\.logoWandEinwilligung\}/);
    assert.match(ohneKommentare(src(ADMIN_SEITE)), /einwilligung=\{t\.logoWandEinwilligung\}/);
  });

  it("die Prop ist typisiert: ein fehlender Schlüssel fällt beim Aufruf auf, nicht im Browser", () => {
    for (const datei of [WIZARD, ORG_DETAIL]) {
      assert.match(src(datei), /einwilligung: LogoWandTexte;/, datei);
    }
    assert.match(src(KOMPONENTE), /\n  t: LogoWandTexte;/);
    assert.doesNotMatch(src(KOMPONENTE), /type Strings/);
  });

  it("die Gruppe `logoWall` bleibt die der Admin-Liste und trägt keine Einwilligungstexte", () => {
    for (const key of ["explain", "consequence", "grant", "revoke", "badgeGranted"]) {
      assert.ok(!(key in de.logoWall), `de.logoWall.${key}`);
    }
    assert.ok("summary" in de.logoWall && "colPartner" in de.logoWall);
  });
});
