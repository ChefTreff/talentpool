import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  fristBeschreibung,
  fristHinweis,
  fristKennungVon,
  fristTitel,
  naechsteFrist,
  naechsteZeilen,
  ordneFristen,
  type Vorlage,
} from "@/components/partner/fristen-aufgaben";
import type { Deliverable, PartnerDeadline } from "@/app/(partner)/partner/types";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/**
 * Die Stammdaten vom 08.10.2026, so wie sie live stehen (nur gelesen): die sechs Fristen, die ein
 * Partner sieht, die vierzehn aktiven Aufgabenvorlagen und die sieben Aufgaben der Testorganisation.
 * Der Abgleich „nichts geht verloren“ (PART-099) läuft auf genau diesen Daten und auf jeder
 * Teilmenge der Aufgaben.
 */
const frist = (key: string, due: string, de: string, en: string, beschreibung: string | null = null): PartnerDeadline => ({
  key,
  due_at: due,
  label_de: de,
  label_en: en,
  description_de: beschreibung,
  description_en: beschreibung,
});

const FRISTEN: PartnerDeadline[] = [
  frist("hackathon_challenge", "2027-03-18T22:59:00+00:00", "Hackathon-Challenge einreichen", "Submit your hackathon challenge", "Vier Wochen vor dem Hackathon: Aufgabe, Preise, Mentorinnen und Mentoren und die Bewertungskriterien."),
  frist("shop_phase1_end", "2027-03-19T22:59:00+00:00", "Messeshop: erste Bestellphase", "Trade fair shop: first ordering phase", "Bis hierhin könnt ihr alles bestellen. Danach geht nur noch, was kurzfristig lieferbar ist."),
  frist("ticket_codes", "2027-03-31T21:59:00+00:00", "Ticket-Codes einlösen", "Redeem ticket codes", "Bis dahin die Partner-Tickets über den Code bzw. den Secret Shop buchen."),
  frist("booth_changes_until", "2027-04-02T21:59:00+00:00", "Änderungen am Messestand", "Booth changes", "Bis zu diesem Tag könnt ihr eure Rückwand hochladen. Danach geht die Datei in den Druck."),
  frist("shop_phase2_end", "2027-04-09T21:59:00+00:00", "Messeshop: Nachbestellung", "Trade fair shop: late orders", "Letzte Frist. Bestellbar ist nur noch, was als kurzfristig lieferbar gekennzeichnet ist."),
  frist("lunch_package", "2027-04-09T21:59:00+00:00", "Lunch-Paket bestellen", "Order the lunch package", "Verpflegung für das Standteam an beiden Tagen."),
];

const regel = (kennung: string | null) => (kennung ? { deadline_key: kennung } : {});
const VORLAGEN: Vorlage[] = [
  { key: "logo_vector", product_sku: null, due_rule: regel(null) },
  { key: "logo_png", product_sku: null, due_rule: regel(null) },
  { key: "backdrop_print", product_sku: "I-79031", due_rule: regel("booth_changes_until") },
  { key: "backdrop_print", product_sku: "I-50131", due_rule: regel("booth_changes_until") },
  { key: "backdrop_print", product_sku: "I-39740", due_rule: regel("booth_changes_until") },
  { key: "backdrop_print", product_sku: "I-39709", due_rule: regel("booth_changes_until") },
  { key: "lunch_package", product_sku: null, due_rule: regel("lunch_package") },
  { key: "digital_branding", product_sku: "I-95690", due_rule: regel("booth_changes_until") },
  { key: "ticket_codes", product_sku: null, due_rule: regel("ticket_codes") },
  { key: "hackathon_challenge", product_sku: "I-37220", due_rule: regel("hackathon_challenge") },
  // Die Vorlage trägt heute die Leistung, die Aufgabe der Testorganisation wurde ohne sie angelegt.
  { key: "hackathon_backdrop", product_sku: "I-37220", due_rule: regel("hackathon_challenge") },
  { key: "initiative_description", product_sku: "INI-PARTNERSCHAFT", due_rule: regel(null) },
  { key: "initiative_volunteers", product_sku: "INI-PARTNERSCHAFT", due_rule: regel(null) },
  { key: "beachflag_print", product_sku: "INI-BEACHFLAG", due_rule: regel(null) },
];

function aufgabe(key: string, extra: Partial<Deliverable> = {}): Deliverable {
  return {
    id: `d-${key}`,
    key,
    type: "upload",
    label_de: key,
    label_en: key,
    description_de: null,
    description_en: null,
    product_sku: null,
    product_name_de: null,
    product_name_en: null,
    status: "open",
    due_at: null,
    submitted_at: null,
    review_note: null,
    required: true,
    file_rules: null,
    answers: {},
    assets: [],
    sort: 0,
    answers_schema: null,
    fulfilled_by_sku: null,
    ...extra,
  };
}

const AUFGABEN: Deliverable[] = [
  aufgabe("logo_vector", { label_de: "Logo als SVG", sort: 10 }),
  aufgabe("logo_png", { label_de: "Logo als PNG", sort: 11 }),
  aufgabe("backdrop_print", { label_de: "Rückwand-Druckdatei", sort: 20, product_sku: "I-50131", due_at: "2027-04-02T21:59:00+00:00" }),
  aufgabe("lunch_package", { label_de: "Lunch-Paket fürs Team vor Ort", sort: 30, type: "booking", due_at: "2027-04-09T21:59:00+00:00" }),
  aufgabe("ticket_codes", { label_de: "Ticket-Codes einlösen", sort: 50, type: "info", due_at: "2027-03-31T21:59:00+00:00" }),
  aufgabe("hackathon_challenge", { label_de: "Hackathon-Challenge", sort: 60, type: "form", product_sku: "I-37220", due_at: "2027-03-18T22:59:00+00:00" }),
  aufgabe("hackathon_backdrop", { label_de: "Rückwand der Challenge Area", sort: 65, due_at: "2027-03-18T22:59:00+00:00" }),
];

const JETZT = new Date("2026-10-08T10:00:00Z").getTime();
const keys = (zeilen: ReturnType<typeof naechsteZeilen>) =>
  zeilen.map((z) => (z.art === "aufgabe" ? z.aufgabe.key : `Frist:${z.frist.key}`));

describe("PART-099: an welcher Frist eine Aufgabe hängt", () => {
  it("das Paar aus Schlüssel und Leistung entscheidet", () => {
    const vorlagen: Vorlage[] = [
      { key: "upload", product_sku: "A", due_rule: regel("frist_a") },
      { key: "upload", product_sku: "B", due_rule: regel("frist_b") },
    ];
    assert.equal(fristKennungVon({ key: "upload", product_sku: "A" }, vorlagen), "frist_a");
    assert.equal(fristKennungVon({ key: "upload", product_sku: "B" }, vorlagen), "frist_b");
  });

  it("passt kein Paar, entscheidet der Schlüssel allein — so bei der Rückwand der Challenge Area", () => {
    // Live: die Aufgabe hat keine Leistung, die Vorlage heute I-37220.
    assert.equal(fristKennungVon({ key: "hackathon_backdrop", product_sku: null }, VORLAGEN), "hackathon_challenge");
  });

  it("vier Rückwand-Vorlagen mit demselben Schlüssel nennen dieselbe Frist", () => {
    assert.equal(fristKennungVon({ key: "backdrop_print", product_sku: "I-39740" }, VORLAGEN), "booth_changes_until");
    assert.equal(fristKennungVon({ key: "backdrop_print", product_sku: null }, VORLAGEN), "booth_changes_until");
  });

  it("sind sich die Vorlagen eines Schlüssels uneins und passt kein Paar, gilt keine — die Frist bleibt sichtbar", () => {
    const vorlagen: Vorlage[] = [
      { key: "upload", product_sku: "A", due_rule: regel("frist_a") },
      { key: "upload", product_sku: "B", due_rule: regel("frist_b") },
    ];
    assert.equal(fristKennungVon({ key: "upload", product_sku: "C" }, vorlagen), null);
    assert.equal(fristKennungVon({ key: "upload", product_sku: null }, vorlagen), null);
  });

  it("ohne Regel, mit leerem Schlüssel, mit Abstand in Tagen oder ohne Vorlage: keine Frist der Edition", () => {
    assert.equal(fristKennungVon({ key: "logo_png", product_sku: null }, VORLAGEN), null);
    assert.equal(fristKennungVon({ key: "unbekannt", product_sku: null }, VORLAGEN), null);
    const vorlagen: Vorlage[] = [
      { key: "a", product_sku: null, due_rule: { deadline_key: "  " } },
      { key: "b", product_sku: null, due_rule: { offset_days: 14 } },
      { key: "c", product_sku: null, due_rule: null },
    ];
    for (const k of ["a", "b", "c"]) assert.equal(fristKennungVon({ key: k, product_sku: null }, vorlagen), null, k);
  });
});

describe("PART-099: Abgleich vorher/nachher — keine Aufgabe, keine Frist geht verloren", () => {
  const { fristVon, ohneAufgabe } = ordneFristen(AUFGABEN, FRISTEN, VORLAGEN);

  it("vier Fristen hängen an Aufgaben, zwei bleiben als eigene Zeile: die Phasen des Messeshops", () => {
    assert.deepEqual(ohneAufgabe.map((f) => f.key), ["shop_phase1_end", "shop_phase2_end"]);
    const getragen = new Set(Object.values(fristVon).map((f) => f.key));
    assert.deepEqual([...getragen].sort(), ["booth_changes_until", "hackathon_challenge", "lunch_package", "ticket_codes"]);
  });

  it("jede Aufgabe mit fester Frist trägt genau die ihre; die Logos tragen keine", () => {
    const erwartet: Record<string, string | undefined> = {
      "d-hackathon_challenge": "hackathon_challenge",
      "d-hackathon_backdrop": "hackathon_challenge",
      "d-ticket_codes": "ticket_codes",
      "d-backdrop_print": "booth_changes_until",
      "d-lunch_package": "lunch_package",
      "d-logo_vector": undefined,
      "d-logo_png": undefined,
    };
    for (const a of AUFGABEN) assert.equal(fristVon[a.id]?.key, erwartet[a.id], a.key);
  });

  it("vorher 6 Fristen + 7 Aufgaben, nachher 9 Zeilen: 7 Aufgaben und 2 Fristen, jede genau einmal", () => {
    const zeilen = [...AUFGABEN.map((a) => `Aufgabe:${a.key}`), ...ohneAufgabe.map((f) => `Frist:${f.key}`)];
    assert.equal(zeilen.length, 9);
    assert.equal(new Set(zeilen).size, 9);
    // Jede der sechs Fristen ist auf der Seite: als Zeile oder als Frist einer Aufgabe, nie doppelt.
    for (const f of FRISTEN) {
      const alsZeile = ohneAufgabe.some((o) => o.key === f.key);
      const anAufgaben = AUFGABEN.filter((a) => fristVon[a.id]?.key === f.key).length;
      assert.equal(alsZeile !== anAufgaben > 0, true, `${f.key}: Zeile ${alsZeile}, Aufgaben ${anAufgaben}`);
    }
  });

  it("auf jeder Teilmenge der Aufgaben: jede Frist steht entweder als Zeile da oder an einer Aufgabe", () => {
    for (let maske = 0; maske < 1 << AUFGABEN.length; maske++) {
      const teil = AUFGABEN.filter((_, i) => maske & (1 << i));
      const z = ordneFristen(teil, FRISTEN, VORLAGEN);
      for (const f of FRISTEN) {
        const alsZeile = z.ohneAufgabe.some((o) => o.key === f.key);
        const anAufgabe = teil.some((a) => z.fristVon[a.id]?.key === f.key);
        assert.equal(alsZeile !== anAufgabe, true, `Maske ${maske}, ${f.key}`);
      }
      // Eine Aufgabe trägt höchstens eine Frist, und keine, die es nicht gibt.
      for (const a of teil) assert.ok(!z.fristVon[a.id] || FRISTEN.includes(z.fristVon[a.id]), a.key);
    }
  });

  it("zwei Aufgaben an derselben Frist tragen sie beide", () => {
    const mit = [aufgabe("backdrop_print", { product_sku: "I-50131" }), aufgabe("digital_branding", { product_sku: "I-95690" })];
    const z = ordneFristen(mit, FRISTEN, VORLAGEN);
    assert.equal(z.fristVon["d-backdrop_print"]?.key, "booth_changes_until");
    assert.equal(z.fristVon["d-digital_branding"]?.key, "booth_changes_until");
    assert.equal(z.ohneAufgabe.some((f) => f.key === "booth_changes_until"), false);
  });

  it("ohne gelesene Vorlagen steht jede Frist für sich: doppelt, aber nichts fehlt", () => {
    const z = ordneFristen(AUFGABEN, FRISTEN, []);
    assert.deepEqual(z.fristVon, {});
    assert.equal(z.ohneAufgabe.length, FRISTEN.length);
  });

  it("eine Frist ohne Datum steht in keiner Liste — wie bisher", () => {
    const ohneDatum = { ...FRISTEN[0], key: "ohne_datum", due_at: null };
    const z = ordneFristen([], [...FRISTEN, ohneDatum], VORLAGEN);
    assert.equal(z.ohneAufgabe.some((f) => f.key === "ohne_datum"), false);
  });

  it("die Fristen ohne Aufgabe stehen nach Datum, bei gleichem Datum nach Schlüssel", () => {
    const z = ordneFristen([], FRISTEN, VORLAGEN);
    assert.deepEqual(z.ohneAufgabe.map((f) => f.key), [
      "hackathon_challenge",
      "shop_phase1_end",
      "ticket_codes",
      "booth_changes_until",
      "lunch_package",
      "shop_phase2_end",
    ]);
  });
});

describe("PART-099: die nächsten Zeilen der Übersicht", () => {
  const z = ordneFristen(AUFGABEN, FRISTEN, VORLAGEN);

  it("Aufgaben und Fristen ohne Aufgabe in einer Reihe nach Datum, die Aufgabe vor der Frist am selben Tag", () => {
    assert.deepEqual(keys(naechsteZeilen(AUFGABEN, z.ohneAufgabe, JETZT, 9)), [
      "hackathon_challenge",
      "hackathon_backdrop",
      "Frist:shop_phase1_end",
      "ticket_codes",
      "backdrop_print",
      "lunch_package",
      "Frist:shop_phase2_end",
      "logo_vector",
      "logo_png",
    ]);
  });

  it("die Übersicht zeigt sechs und schneidet dahinter ab", () => {
    assert.equal(naechsteZeilen(AUFGABEN, z.ohneAufgabe, JETZT, 6).length, 6);
  });

  it("Zurückgewiesenes und Überfälliges stehen vor allem anderen", () => {
    const aufgaben = [
      ...AUFGABEN,
      aufgabe("spaet", { status: "overdue", due_at: "2027-05-01T00:00:00+00:00", sort: 99 }),
      aufgabe("nochmal", { status: "rejected", due_at: "2027-06-01T00:00:00+00:00", sort: 98 }),
    ];
    assert.deepEqual(keys(naechsteZeilen(aufgaben, z.ohneAufgabe, JETZT, 3)), ["nochmal", "spaet", "hackathon_challenge"]);
  });

  it("Erledigtes und Eingereichtes erscheint nicht", () => {
    const aufgaben = AUFGABEN.map((a) => (a.key === "hackathon_challenge" ? { ...a, status: "accepted" as const } : a.key === "ticket_codes" ? { ...a, status: "submitted" as const } : a));
    const gezeigt = keys(naechsteZeilen(aufgaben, z.ohneAufgabe, JETZT, 20));
    assert.equal(gezeigt.includes("hackathon_challenge"), false);
    assert.equal(gezeigt.includes("ticket_codes"), false);
  });

  it("eine verstrichene Frist ohne Aufgabe steht nicht mehr da — auf der Checkliste bleibt sie", () => {
    const nachPhase1 = new Date("2027-03-20T10:00:00Z").getTime();
    const gezeigt = keys(naechsteZeilen(AUFGABEN, z.ohneAufgabe, nachPhase1, 20));
    assert.equal(gezeigt.includes("Frist:shop_phase1_end"), false);
    assert.equal(gezeigt.includes("Frist:shop_phase2_end"), true);
  });
});

describe("PART-099: die nächste Frist im Band", () => {
  const z = ordneFristen(AUFGABEN, FRISTEN, VORLAGEN);

  it("das früheste Datum unter allem Offenen, mit dem Titel der Frist", () => {
    const n = naechsteFrist(AUFGABEN, z, JETZT, "de");
    assert.deepEqual(n, { dueAt: "2027-03-18T22:59:00+00:00", titel: "Hackathon-Challenge einreichen" });
    assert.equal(naechsteFrist(AUFGABEN, z, JETZT, "en")?.titel, "Submit your hackathon challenge");
  });

  it("sind die Aufgaben dazu erledigt, rückt die nächste nach — auch eine Frist ohne Aufgabe", () => {
    const erledigt = AUFGABEN.map((a) => (a.key.startsWith("hackathon") ? { ...a, status: "accepted" as const } : a));
    const n = naechsteFrist(erledigt, ordneFristen(erledigt, FRISTEN, VORLAGEN), JETZT, "de");
    assert.deepEqual(n, { dueAt: "2027-03-19T22:59:00+00:00", titel: "Messeshop: erste Bestellphase" });
  });

  it("eine Aufgabe ohne Frist der Edition nennt sich selbst", () => {
    const eine = [aufgabe("sonder", { label_de: "Sonderaufgabe", due_at: "2027-01-01T00:00:00+00:00" })];
    assert.deepEqual(naechsteFrist(eine, { fristVon: {}, ohneAufgabe: [] }, JETZT, "de"), {
      dueAt: "2027-01-01T00:00:00+00:00",
      titel: "Sonderaufgabe",
    });
  });

  it("nichts offen, nichts bevorstehend: keine", () => {
    assert.equal(naechsteFrist([], { fristVon: {}, ohneAufgabe: [] }, JETZT, "de"), null);
    const spaet = new Date("2028-01-01T00:00:00Z").getTime();
    assert.equal(naechsteFrist(AUFGABEN, z, spaet, "de"), null);
  });
});

describe("PART-099: der Text der Frist im Detail der Aufgabe", () => {
  const challenge = FRISTEN[0];
  it("der Text der Frist steht da — er sonst nur an der Frist stand", () => {
    assert.match(fristHinweis(challenge, AUFGABEN[5], "de") ?? "", /^Vier Wochen vor dem Hackathon/);
    assert.equal(fristBeschreibung(challenge, "en"), challenge.description_en);
  });

  it("ohne Text steht der Titel, wenn er etwas anderes sagt als die Aufgabe — sonst nichts", () => {
    const ohneText = { ...challenge, description_de: null, description_en: null };
    assert.equal(fristHinweis(ohneText, AUFGABEN[5], "de"), "Hackathon-Challenge einreichen");
    assert.equal(fristHinweis(ohneText, aufgabe("x", { label_de: "Hackathon-Challenge einreichen" }), "de"), null);
    assert.equal(fristTitel(ohneText, "en"), "Submit your hackathon challenge");
  });

  it("ein leerer Text zählt nicht", () => {
    assert.equal(fristBeschreibung({ ...challenge, description_de: "  ", description_en: "  " }, "de"), null);
  });
});

describe("PART-099: Seiten, Liste und Wörterbuch", () => {
  const start = src("app/(partner)/partner/page.tsx");
  const liste = src("app/(partner)/partner/checkliste/page.tsx");
  const ansicht = src("app/(partner)/partner/checkliste/ChecklistView.tsx");

  it("die Übersicht zeigt eine Liste: keine zweite Spalte „Fristen“, kein Link auf einen Abschnitt, den es nicht mehr gibt", () => {
    assert.match(start, /naechsteFrist, naechsteZeilen, ordneFristen/);
    assert.match(start, /fristVon=\{zuordnung\.fristVon\}/);
    assert.match(start, /groups=\{\[\{ sku: null, label: t\.partner\.nextTasksTitle, zeilen \}\]\}/);
    assert.doesNotMatch(start, /FristenListe|fristenAuswahl|checkliste#fristen|deadlinesTitle|deadlinesAll|tasksSectionTitle/);
  });

  it("das Band nennt die nächste Frist aus derselben Liste", () => {
    assert.match(start, /naechsteFrist\(aufgaben, zuordnung, jetzt, locale\)/);
    assert.match(start, /kurzDatum\.format\(new Date\(naechste\.dueAt\)\)/);
    assert.match(start, /hint=\{naechste \? naechste\.titel : t\.partner\.bandStatNone\}/);
  });

  it("die Checkliste hat keinen Abschnitt „Fristen“ mehr; Fristen ohne Aufgabe stehen unter den allgemeinen Aufgaben", () => {
    assert.doesNotMatch(liste, /id="fristen"|FristenListe|fristenAuswahl|deadlinesTitle|deadlinesLead/);
    assert.match(liste, /ordneFristen\(deliverables, overview\.deadlines, vorlagen\)/);
    assert.match(liste, /gruppe\(null, t\.partnerChecklist\.groupGeneral\)/);
    assert.match(liste, /allgemein\.zeilen\.push\(\.\.\.ohneAufgabe\.map/);
    // Das Menü „Auf dieser Seite“ führt nur noch die Gruppen.
    assert.match(liste, /const navigation = groups\.map/);
  });

  it("beide Seiten lesen die Vorlagen über denselben Lader", () => {
    for (const s of [start, liste]) assert.match(s, /loadFristVorlagen\(supabase\)/);
    const lader = src("lib/partner/vorlagen.ts");
    assert.match(lader, /^import "server-only";/);
    assert.match(lader, /\.from\("deliverable_template"\)\s*\.select\("key, product_sku, due_rule"\)\s*\.eq\("active", true\)/);
    // Fehlt das Lesen, steht jede Frist für sich — nie eine leere Seite.
    assert.match(lader, /return \[\];/);
  });

  it("der Helfer ist rein: kein server-only, keine Datenbank, kein Browser", () => {
    const helfer = src("components/partner/fristen-aufgaben.ts");
    assert.doesNotMatch(helfer, /server-only|supabase|window|document\./);
  });

  it("die Liste kennt zwei Arten von Zeilen; gezählt werden nur die Aufgaben", () => {
    assert.match(ansicht, /zeilen: Zeile\[\]/);
    assert.match(ansicht, /if \(z\.art === "frist"\) return fristZeile\(z\.frist\)/);
    assert.match(ansicht, /const aufgabenDer = \(group: ChecklistGroup\) => group\.zeilen\.flatMap/);
    assert.match(ansicht, /\{hinweis && <p className="ct-help mt-1">\{hinweis\}<\/p>\}/);
  });

  it("das alte Modul ist weg, und kein Text der alten Abschnitte steht mehr im Wörterbuch", () => {
    assert.equal(existsSync(new URL("../app/(partner)/partner/fristen.tsx", import.meta.url)), false);
    for (const datei of ["lib/i18n/de.json", "lib/i18n/en.json"]) {
      const wb = JSON.parse(src(datei));
      for (const k of ["tasksSectionTitle", "deadlinesTitle", "deadlinesNone", "deadlinesAll", "deadlineOverdue"]) {
        assert.equal(k in wb.partner, false, `${datei}: partner.${k}`);
      }
      for (const k of ["deadlinesTitle", "deadlinesLead"]) assert.equal(k in wb.partnerChecklist, false, `${datei}: partnerChecklist.${k}`);
      // Was die gemeinsame Liste braucht, steht da.
      for (const k of ["nextTasksTitle", "nextTasksNone", "nextTasksAll", "bandStatLabel", "bandStatNone"]) assert.ok(wb.partner[k], `${datei}: partner.${k}`);
      assert.ok(wb.partnerChecklist.deadlineLabel, `${datei}: partnerChecklist.deadlineLabel`);
    }
  });
});
