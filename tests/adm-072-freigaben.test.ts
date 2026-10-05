import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  FREIGABE_ARTEN,
  istFreigabeArt,
  summeOffen,
  waehleArt,
  type FreigabeZaehler,
} from "@/lib/freigaben";

/**
 * ADM-072 (Paulina 05.10.): alles Freigabepflichtige an einem Ort. Die Einzelbereiche
 * (Reisekosten, Hotels, Programm) behalten Lesen und Verlauf; Freigeben und Ablehnen
 * gibt es nur in der zentralen Übersicht (`/admin/einreichungen`).
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

describe("ADM-072: welche Art die Seite zeigt", () => {
  it("fünf Arten, in der Reihenfolge der Reiter", () => {
    assert.deepEqual([...FREIGABE_ARTEN], ["inhalte", "slots", "reisekosten", "hotel", "shuttle"]);
    assert.equal(istFreigabeArt("hotel"), true);
    assert.equal(istFreigabeArt("tickets"), false);
    assert.equal(istFreigabeArt(undefined), false);
  });

  it("die gewählte Art gilt, wenn die Person sie entscheiden darf", () => {
    const z: FreigabeZaehler = { inhalte: 0, slots: 2, hotel: 1 };
    assert.equal(waehleArt("hotel", z), "hotel");
    assert.equal(waehleArt("slots", z), "slots");
  });

  it("eine Art ohne Recht wird nie gewählt — auch nicht per Adresse", () => {
    const z: FreigabeZaehler = { inhalte: 1, slots: 0 };
    assert.equal(waehleArt("reisekosten", z), "inhalte", "fällt auf die erste Art mit offenen Einträgen");
    assert.equal(waehleArt("shuttle", z), "inhalte");
  });

  it("ohne Parameter: die erste Art mit offenen Einträgen, sonst die erste erlaubte", () => {
    assert.equal(waehleArt(undefined, { inhalte: 0, slots: 0, reisekosten: 3, hotel: 1 }), "reisekosten");
    assert.equal(waehleArt(undefined, { inhalte: 0, hotel: 0 }), "inhalte");
    assert.equal(waehleArt("quatsch", { slots: 0, shuttle: 0 }), "slots");
  });

  it("wer gar nichts entscheiden darf, bekommt keine Art", () => {
    assert.equal(waehleArt(undefined, {}), null);
    assert.equal(waehleArt("hotel", {}), null);
  });

  it("die Summe zählt nur erlaubte Arten", () => {
    assert.equal(summeOffen({}), 0);
    assert.equal(summeOffen({ inhalte: 2, slots: 3, reisekosten: 1, hotel: 0, shuttle: 4 }), 10);
    assert.equal(summeOffen({ shuttle: 4 }), 4);
  });
});

describe("ADM-072: die zentrale Seite", () => {
  const seite = () => quelle("app/(admin)/admin/einreichungen/page.tsx");

  it("öffnet für jeden, der mindestens eine Art entscheiden darf, und prüft jede Art einzeln", () => {
    const s = seite();
    assert.match(s, /requireAnyAdminSection\(\["submissions", "programme", "expenses", "hospitality"\]/);
    assert.match(s, /mayEnterAdminSection\(ABSCHNITT\[a\], roleNames\)/);
    for (const [art, abschnitt] of [
      ["inhalte", "submissions"],
      ["slots", "programme"],
      ["reisekosten", "expenses"],
      ["hotel", "hospitality"],
      ["shuttle", "hospitality"],
    ]) {
      assert.match(s, new RegExp(`${art}: "${abschnitt}"`), `${art} → ${abschnitt}`);
    }
  });

  it("lädt nur, was die Person entscheiden darf", () => {
    const s = seite();
    for (const aufruf of [
      'darf.inhalte ? supabase.rpc("pending_submissions")',
      "darf.slots ? loadSlotFreigaben(roleNames)",
      'darf.reisekosten ? supabase.rpc("expense_queue")',
      'darf.hotel ? supabase.rpc("hospitality_admin_overview")',
      'darf.shuttle ? supabase.rpc("shuttle_bookings_admin")',
    ]) {
      assert.ok(s.includes(aufruf), `fehlt: ${aufruf}`);
    }
  });

  it("zeigt je Art den vorhandenen Baustein, Reisekosten und Shuttle im Modus „freigabe“", () => {
    const s = seite();
    assert.match(s, /<SubmissionQueue/);
    assert.match(s, /<FreigabeListe/);
    assert.match(s, /<ExpenseQueue\s+modus="freigabe"/);
    assert.match(s, /<HotelFreigabe/);
    assert.match(s, /<ShuttleAdmin\s+modus="freigabe"/);
    // offene Einträge: nur eingereichte Anträge, nur angefragte Fahrten, nur angefragte oder wartende Buchungen
    assert.match(s, /c\.status === "submitted"/);
    assert.match(s, /r\.status === "requested"/);
    assert.match(s, /b\.status === "requested" \|\| b\.status === "waitlisted"/);
  });

  it("jede Art trägt ihren Zähler im Reiter", () => {
    const s = seite();
    assert.match(s, /label: `\$\{ta\[`tab_\$\{a\}`\]\} \(\$\{zaehler\[a\]\}\)`/);
    assert.match(s, /aktiv: a === art/);
  });
});

describe("ADM-072: die Einzelbereiche behalten Lesen und Verlauf", () => {
  it("Reisekosten: ohne Modus „freigabe“ gibt es kein Freigeben und Zurückweisen", () => {
    const q = quelle("app/(admin)/admin/reisekosten/ExpenseQueue.tsx");
    assert.match(q, /modus = "verlauf"/);
    assert.match(q, /c\.status === "submitted" && modus === "freigabe" && \(/);
    // im Bereich: Verweis statt Knöpfe
    assert.match(q, /c\.status === "submitted" && modus === "verlauf" && \(\s+<Link href="\/admin\/einreichungen\?art=reisekosten"/);
    // die Auszahlung bleibt (keine Freigabe)
    assert.match(q, /c\.status === "approved" && \(/);
    assert.match(q, /t\.markPaid/);
    // die Seite des Bereichs ruft ohne den Modus auf
    assert.doesNotMatch(quelle("app/(admin)/admin/reisekosten/page.tsx"), /modus="freigabe"/);
  });

  it("Hotels: das Kontingent zeigt Buchungen nur noch zum Lesen", () => {
    const h = quelle("app/(admin)/admin/hospitality/HospitalityAdmin.tsx");
    assert.doesNotMatch(h, /confirmBooking|declineBooking/);
    assert.match(h, /href="\/admin\/einreichungen\?art=hotel"/);
    // die Aktionen wohnen in der zentralen Seite
    const f = quelle("app/(admin)/admin/einreichungen/HotelFreigabe.tsx");
    assert.match(f, /confirmBooking\(b\.id, note\(b\.id\)\)/);
    assert.match(f, /declineBooking\(b\.id, note\(b\.id\)\)/);
    // Ablehnen verlangt wie bisher eine Anmerkung
    assert.match(f, /disabled=\{pending \|\| note\(b\.id\)\.trim\(\) === ""\}/);
  });

  it("Shuttle: Freigeben nur in der Freigabe, im Bereich bleiben Liste, Export und Stornieren bestätigter Fahrten", () => {
    const s = quelle("app/(admin)/admin/hospitality/ShuttleAdmin.tsx");
    assert.match(s, /modus = "verlauf"/);
    assert.match(s, /r\.status === "requested" && freigabe && \(/);
    assert.match(s, /\(freigabe \? r\.status === "requested" : r\.status === "confirmed"\)/);
    assert.match(s, /\{!freigabe && \(\s+<div className="flex flex-wrap items-center gap-2">/, "Export nur im Bereich");
    assert.doesNotMatch(quelle("app/(admin)/admin/hospitality/page.tsx"), /modus="freigabe"/);
  });

  it("die Freigabe der Slots zieht um, die alte Adresse leitet weiter — hinter dem Abschnitts-Gate", () => {
    const p = quelle("app/(admin)/admin/programm/freigabe/page.tsx");
    assert.match(p, /await requireAdminSection\("programme", "\/admin\/programm\/freigabe"\)/);
    assert.match(p, /redirect\("\/admin\/einreichungen\?art=slots"\)/);
    assert.match(quelle("components/programme/TableTabs.tsx"), /href: "\/admin\/einreichungen\?art=slots"/);
    // der Ladecode steht an einer Stelle
    assert.match(quelle("components/programme/loadFreigabe.ts"), /export async function loadSlotFreigaben/);
  });

  it("der Menüpunkt heißt Freigaben und führt zur zentralen Seite", () => {
    assert.match(quelle("lib/admin-navigation.ts"), /href: "\/admin\/einreichungen", label: "submissions"/);
    assert.equal(woerterbuch("de").admin.nav.submissions, "Freigaben");
    assert.equal(woerterbuch("en").admin.nav.submissions, "Approvals");
  });
});

describe("ADM-072: Testdaten für Konrads Konto", () => {
  const skript = () => quelle("scripts/testdaten-konrad.mjs");
  const schritt = () => {
    const s = skript();
    const von = s.indexOf("async function freigabenSchritt");
    const bis = s.indexOf("/** Die Schritte, die `--nur` kennt. */");
    assert.ok(von > 0 && bis > von, "freigabenSchritt steht vor der Schrittliste");
    return s.slice(von, bis);
  };

  it("der Schritt ist unter --nur=freigaben erreichbar und in der Kopfdoku beschrieben", () => {
    assert.match(skript(), /^\s+freigaben: freigabenSchritt,$/m);
    assert.match(skript(), /--apply --nur=freigaben\s+\(ADM-072/);
  });

  it("legt alle drei wartenden Einträge an und kennzeichnet sie als TEST", () => {
    const s = schritt();
    assert.match(s, /from\("session_submission"\)[\s\S]*status: "submitted"/);
    assert.match(s, /from\("expense_claim"\)[\s\S]*status: "submitted"/);
    assert.match(s, /from\("hospitality_booking"\)[\s\S]*status: "waitlisted"/);
    // Kennzeichnung: Hinweis mit TEST-Präfix, Rechnungsnummer mit ZZTEST
    assert.match(skript(), /const FREIGABE_HINWEIS = `\$\{PREFIX\}nur zum Ausprobieren der Freigabe`/);
    assert.match(skript(), /const FREIGABE_RECHNUNG = `\$\{PREFIX_CODE\}-RK-0001`/);
  });

  it("schreibt direkt und löst weder Mail noch Buchung über die Funktionen der Speaker aus", () => {
    const s = schritt();
    assert.doesNotMatch(s, /\.rpc\(/, "kein RPC: submit_expense und book_hospitality würden Mails an das Team schicken");
  });

  it("die Hotelanfrage steht auf der Warteliste: sie nimmt echten Speakern keinen Platz weg", () => {
    // `hospitality_used` zählt nur requested und confirmed
    assert.match(schritt(), /status: "waitlisted"/);
    assert.doesNotMatch(schritt(), /status: "requested"/);
  });

  it("fasst eine eigene Hotelbuchung von Konrad nicht an und gibt dem verwalteten TEST-Speaker den Vorrang", () => {
    const s = schritt();
    assert.match(s, /const kandidaten = \[verwaltetesProfil\?\.id, sp\.id\]\.filter\(Boolean\)/);
    assert.match(s, /\.neq\("status", "cancelled"\)/);
  });

  it("setzt eine freigegebene Abrechnung nicht zurück — der Beleg ist dann bei SevDesk", () => {
    assert.match(schritt(), /!\["draft", "rejected"\]\.includes\(abrechnung\.status\)/);
  });

  it("--remove räumt Abrechnung samt Rechnungsdatei, Hotelanfrage und Vorschlag weg", () => {
    const s = skript();
    const remove = s.slice(s.indexOf("async function remove(me)"), s.indexOf("const me = await person();"));
    assert.match(remove, /TEST-Abrechnung entfernt \(mit abgelegter Rechnung\)/);
    assert.match(remove, /storage\.from\("speaker-assets"\)\.remove\(dateien\.map/);
    assert.match(remove, /from\("hospitality_booking"\)\.delete\(\)\.contains\("details", \{ special: FREIGABE_HINWEIS \}\)/);
    assert.match(remove, /from\("session_submission"\)\.delete\(\)\.eq\("notes", FREIGABE_HINWEIS\)/);
    // vor dem Profil, damit nichts als Waise bleibt
    assert.ok(remove.indexOf("TEST-Abrechnung entfernt") < remove.indexOf('"Speaker-Profil entfernt"'));
  });
});

describe("ADM-072: Texte", () => {
  it("stehen in DE und EN", () => {
    const schluessel = [
      "title",
      "lead",
      "openCount",
      "tabsLabel",
      "tab_inhalte",
      "tab_slots",
      "tab_reisekosten",
      "tab_hotel",
      "tab_shuttle",
      "emptyTitle",
      "emptyBody",
      "noAccessTitle",
      "noAccessBody",
    ];
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache);
      for (const k of schluessel) assert.ok(w.adminApprovals[k], `${sprache}.adminApprovals.${k} fehlt`);
      assert.ok(w.admin.expenses.toApprovals, `${sprache}.admin.expenses.toApprovals fehlt`);
      assert.ok(w.admin.hospitality.toApprovals, `${sprache}.admin.hospitality.toApprovals fehlt`);
    }
    // jede Art hat ihren Reiter-Text
    for (const art of FREIGABE_ARTEN) assert.ok(woerterbuch("de").adminApprovals[`tab_${art}`], art);
  });
});
