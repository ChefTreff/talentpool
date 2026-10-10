import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ustSaetze } from "@/lib/partner/ust";
import { tourAenderungen, tourEntwurf, type TourStopp } from "@/components/partner/tour";

/**
 * Feinschliff aus dem Durchgang durch das Partner-Portal vom 05.10.2026 (Konrad & Leopold): PART-108 (Kontakte: Zähler raus, Rollenerklärung ausgegraut), PART-117 (Shop: USt mit Satz),
 * PART-126 („Fragen“ → „Bewerbungsfragen“), PART-127 (Company Tour: keine Zeitslot-Abfrage). Keine Migration; die Regeln als Verhalten, die Verdrahtung am Quelltext — Komponenten lädt der
 * Testlader nicht.
 */
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (ts: string) => ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const woerterbuch = (sprache: string) => JSON.parse(src(`lib/i18n/${sprache}.json`)) as Record<string, Record<string, string>>;
const NBSP = " ";

describe("PART-117: Umsatzsteuersätze einer Bestellung", () => {
  it("ein Satz für alle Zeilen: „19 %“, mit geschütztem Leerzeichen", () => {
    assert.equal(ustSaetze([{ vat_rate: 19 }, { vat_rate: 19 }], "de-DE"), `19${NBSP}%`);
    assert.equal(ustSaetze([{ vat_rate: 7 }], "de-DE"), `7${NBSP}%`);
  });

  it("gemischte Sätze: aufsteigend und je einmal — eine Zahl, die nur einen nennt, stimmte nicht", () => {
    assert.equal(ustSaetze([{ vat_rate: 19 }, { vat_rate: 7 }, { vat_rate: 19 }, { vat_rate: 7 }], "de-DE"), `7${NBSP}% · 19${NBSP}%`);
    assert.equal(ustSaetze([{ vat_rate: 19 }, { vat_rate: 0 }, { vat_rate: 7 }], "de-DE"), `0${NBSP}% · 7${NBSP}% · 19${NBSP}%`);
  });

  it("Zeilen ohne Satz zählen nicht; ohne Satz und ohne Zeilen bleibt die Beschriftung, wie sie war", () => {
    assert.equal(ustSaetze([{ vat_rate: null }, { vat_rate: 19 }], "de-DE"), `19${NBSP}%`);
    assert.equal(ustSaetze([{ vat_rate: null }], "de-DE"), null);
    assert.equal(ustSaetze([], "de-DE"), null);
    assert.equal(ustSaetze(null, "de-DE"), null);
    assert.equal(ustSaetze(undefined, "de-DE"), null);
    // Unsinn aus der Datenbank (negativ, nicht numerisch) erzeugt keinen Satz.
    assert.equal(ustSaetze([{ vat_rate: -5 }, { vat_rate: "abc" }, { vat_rate: "" }], "de-DE"), null);
  });

  it("numeric kommt auch als Text an („19“) und Nachkommastellen folgen der Sprache", () => {
    assert.equal(ustSaetze([{ vat_rate: "19" }, { vat_rate: 19 }], "de-DE"), `19${NBSP}%`);
    // Nur Text, keine Zahl daneben: ohne Wandlung bliebe der Satz weg.
    assert.equal(ustSaetze([{ vat_rate: "7" }], "de-DE"), `7${NBSP}%`);
    assert.equal(ustSaetze([{ vat_rate: "19" }, { vat_rate: "7" }], "de-DE"), `7${NBSP}% · 19${NBSP}%`);
    assert.equal(ustSaetze([{ vat_rate: 5.5 }], "de-DE"), `5,5${NBSP}%`);
    assert.equal(ustSaetze([{ vat_rate: 5.5 }], "en-GB"), `5.5${NBSP}%`);
  });

  it("die Zeile „Netto, USt, brutto“ nennt den Satz — Warenkorb und Historie teilen sie", () => {
    const z = code(src("app/(partner)/partner/shop/Zusammenfassung.tsx"));
    assert.match(z, /const saetze = ustSaetze\(order\.lines, dateLocale\);/);
    assert.match(z, /\{saetze \? `\$\{t\.vat\} \(\$\{saetze\}\)` : t\.vat\}:/);
    // Der Betrag bleibt unverändert die Summe der Bestellung.
    assert.match(z, /\{money\(order\.vat_cents\)\}/);
  });
});

describe("PART-126: „Bewerbungsfragen“ in allen Formaten", () => {
  it("der Reiter heißt so, in beiden Sprachen — und die Sätze, die den Reiter nennen, ebenso", () => {
    const de = woerterbuch("de");
    const en = woerterbuch("en");
    assert.equal(de.partnerBewerbung.tabQuestions, "Bewerbungsfragen");
    assert.equal(en.partnerBewerbung.tabQuestions, "Application questions");
    assert.match(de.partnerBewerbung.noSessionsBody, /Teilnehmende und Bewerbungsfragen\.$/);
    assert.match(en.partnerBewerbung.noSessionsBody, /participants and application questions appear here\.$/);
    assert.match(de.partnerMasterclass.lead, /die Bewerbungsfragen dazu\.$/);
    assert.match(en.partnerMasterclass.lead, /application questions\.$/);
  });

  it("alle Formate nehmen dieselbe Beschriftung: der Reiter kommt nur aus `tabQuestions`", () => {
    const leiste = src("app/(partner)/partner/FormatReiter.tsx");
    assert.match(leiste, /label: t\.tabQuestions/);
    for (const datei of [
      "app/(partner)/partner/FormatUnterseite.tsx",
      "app/(partner)/partner/interview-tables/page.tsx",
      "app/(partner)/partner/side-event/page.tsx",
      "app/(partner)/partner/masterclass/MasterclassKopf.tsx",
    ]) {
      assert.match(src(datei), /tabQuestions: (b|t\.partnerBewerbung)\.tabQuestions/, datei);
    }
    // Kein Format hat eine eigene Beschriftung für den Reiter.
    for (const sprache of ["de", "en"]) {
      const w = woerterbuch(sprache);
      for (const [abschnitt, werte] of Object.entries(w)) {
        if (abschnitt === "partnerBewerbung") continue;
        assert.ok(!("tabQuestions" in werte), `${sprache}.${abschnitt} hat ein eigenes tabQuestions`);
      }
    }
  });
});

describe("PART-127: keine Zeitslot-Abfrage am Tour-Stopp", () => {
  const zeile: TourStopp = {
    stop_id: "s1", tour_id: "t1", tour_name: "Tour", tour_starts_at: null, tour_ends_at: null, sort_order: 1, arrival_at: null, departure_at: null,
    address: "Testweg 1", contact_name: null, contact_email: null, contact_phone: null, time_note: "11:30–14:00", snacks: null, notes_public: null,
    target_profile: null, photos_allowed: null, filled_at: null, lead_name: null, lead_role_de: null, lead_role_en: null, lead_email: null, lead_phone: null, lead_photo_path: null,
  } as TourStopp;

  it("der Entwurf trägt kein `time_note`, und eine Änderung der Maske schickt nie eines mit", () => {
    const vorher = tourEntwurf(zeile);
    assert.ok(!("time_note" in vorher), "der Entwurf führt das Feld nicht mehr");
    const jetzt = { ...vorher, contact_name: "Ada", address: "Neuer Weg 2" };
    assert.deepEqual(tourAenderungen(vorher, jetzt), { contact_name: "Ada", address: "Neuer Weg 2" });
    // Auch wenn jemand ein Feld einschleust: die Liste der Felder kennt es nicht.
    assert.deepEqual(tourAenderungen(vorher, { ...jetzt, time_note: "9:00" } as typeof jetzt), { contact_name: "Ada", address: "Neuer Weg 2" });
  });

  it("die Maske fragt es nicht mehr, im Quelltext und in den Wörterbüchern", () => {
    const maske = code(src("components/partner/TourStopp.tsx"));
    assert.doesNotMatch(maske, /time_note|timeNote|id\("zeit"\)/);
    // Die zweite Zeile der Maske hat zwei Felder (Snacks, Fotos) — zwei Spalten, keine leere dritte.
    assert.match(maske, /<div className="grid gap-4 sm:grid-cols-2">\s*<Field label=\{t\.snacks\}/);
    for (const sprache of ["de", "en"]) {
      const w = woerterbuch(sprache);
      assert.ok(!("timeNote" in w.partnerTour), `${sprache}: timeNote bleibt im Wörterbuch`);
      assert.ok(!("timeNoteHint" in w.partnerTour), `${sprache}: timeNoteHint bleibt im Wörterbuch`);
    }
  });

  it("die Datenbank nimmt `time_note` weiter an — die Maske bietet nur weniger an (kein Datenverlust, keine Migration)", () => {
    const rpc = src("supabase/snapshot/functions/partner_update_tour_stop.sql");
    assert.match(rpc, /time_note/);
    assert.match(src("components/partner/tour.ts"), /`time_note` nimmt die RPC weiter an/);
  });
});

describe("PART-108: Kontakte", () => {
  it("die Überschrift trägt keinen Zähler mehr", () => {
    const seite = code(src("app/(partner)/partner/kontakte/page.tsx"));
    assert.match(seite, /description=\{t\.partnerContacts\.lead\}/);
    assert.doesNotMatch(seite, /contacts\.length/);
  });

  it("die Erklärung jeder Rolle ist ausgegraut, ihre Überschrift nicht", () => {
    const liste = src("components/partner/ContactList.tsx");
    assert.match(liste, /<dt className="ct-label text-ink">\{rolle\(r\)\}<\/dt>/);
    assert.match(liste, /<dd className="ct-small mt-1 leading-6 text-muted">\{t\[`roleHelp_\$\{r\}`\]\}<\/dd>/);
  });
});
