import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * K-78 und K-72 (Konrad 08.10.): die Weitergabe an Partner ist bei Formaten mit Auswahl durch den Gastgeber Pflicht (K-78, Weg B: ohne Zustimmung
 * keine Bewerbung), und der Partner darf die Person einmalig zu diesem Format kontaktieren (K-72). Beides sagt die Partner-Oberfläche an der Stelle, an der
 * die Daten liegen: ein Satz über der Liste (Masterclass, Company Tour, Side Event …) und die Notiz im Schubfach. Gelesen wird der Quelltext — der Testlader
 * lädt keine JSX-Dateien; ob der Hinweis wirklich erscheint, zeigt der Blick in den Browser (PR-Beschreibung).
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") => JSON.parse(quelle(`lib/i18n/${sprache}.json`)).partnerApplicants as Record<string, string>;

describe("K-78 und K-72: Hinweise zur Weitergabe in den Bewerbungslisten der Partner", () => {
  it("der Listenhinweis (K-78) sagt in beiden Sprachen, dass Bewerben die Zustimmung zur Weitergabe voraussetzt", () => {
    const de = woerterbuch("de").consentNote;
    const en = woerterbuch("en").consentNote;
    assert.match(de, /nur bewerben/);
    assert.match(de, /Weitergabe/);
    assert.match(de, /zugestimmt/);
    assert.match(en, /Only people who have agreed/);
    assert.match(en, /share their application with you/);
    assert.doesNotMatch(de, /\bSie\b|\bIhre?\b/, "ihr-Ansprache");
  });

  it("die Notiz im Schubfach (K-72) behält den ersten Satz und nennt die einmalige Kontaktaufnahme samt Grenzen", () => {
    const de = woerterbuch("de").detailNote;
    const en = woerterbuch("en").detailNote;
    assert.match(de, /^Gezeigt wird nur, was diese Person zur Weitergabe an euch freigegeben hat\./);
    assert.match(de, /einmalig zu diesem Format kontaktieren/);
    assert.match(de, /Einladung, Termine, Rückfragen/);
    assert.match(de, /nicht für Werbung/);
    assert.match(de, /Talentpools/);
    assert.match(en, /^Only what this person has released to you is shown\./);
    assert.match(en, /contact them once about this format/);
    assert.match(en, /not for advertising/);
    assert.match(en, /talent pools/);
  });

  it("beide Listen setzen den Hinweis zwischen Einleitung und Protokoll-Satz (Quelltext-Prüfung)", () => {
    for (const datei of ["app/(partner)/partner/FormatBewerbungen.tsx", "app/(partner)/partner/company-tour/TourBewerbungen.tsx"]) {
      const q = quelle(datei);
      assert.match(
        q,
        /\{nurTeilnehmende \? s\.participantsLead : s\.applicationsLead\} \{t\.applicants\.consentNote\} \{t\.applicants\.auditNotice\}/,
        datei,
      );
    }
  });

  it("das Schubfach zeigt die Notiz (Quelltext-Prüfung)", () => {
    assert.match(quelle("components/partner/BewerbungProfil.tsx"), /<p className="ct-help">\{t\.detailNote\}<\/p>/);
  });
});
