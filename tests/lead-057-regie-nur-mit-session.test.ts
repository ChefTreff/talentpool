import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { anweisungenMoeglich } from "@/components/regie/types";

/**
 * LEAD-057 (Feedbackrunde Konrad und Paulina 05.10.2026): die Regieanweisungen der Stage Leads (`/speaker-leads/regie`) sind **nur für Slots mit Session** ausfüllbar —
 * Personen auf der Bühne, Mikrofone, Video mit oder ohne Ton gehören zu einem Auftritt. Ein leerer Slot steht in der Liste, damit man den Plan der Bühne sieht, trägt aber
 * keine Eingabefelder. **Keine Datenbankänderung:** `set_regie_anweisungen` (nur die fünf Felder, Recht `can_edit_regie`) und `lead_regie_slots` bleiben; die Produktion plant
 * Cues ohne Session (Doors open, Umbau, Puffer) weiter unter `/admin/regie`. Die Eingabe ist eine Frage der Oberfläche, kein Recht — ein Schreibzugriff auf einen leeren
 * Slot ist harmlos und kein Sicherheitsfall.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const LISTE = "components/regie/Anweisungsliste.tsx";

/** Die Zeile eines Slots: von der Funktion `Zeile` bis zum Ende der Datei. */
function zeile(): string {
  const q = quelle(LISTE);
  const von = q.indexOf("function Zeile(");
  assert.ok(von > 0, "Zeile fehlt");
  return q.slice(von);
}

describe("LEAD-057: wann sich Anweisungen eintragen lassen (ausgeführt)", () => {
  it("nur mit einer Session: Kennung ja; ohne Session (null) und leere Kennung nein", () => {
    assert.equal(anweisungenMoeglich({ session_id: "7b0c5a52-0f0e-4f0b-9d3c-0b9d2b0c9f11" }), true);
    assert.equal(anweisungenMoeglich({ session_id: null }), false);
    assert.equal(anweisungenMoeglich({ session_id: "" }), false);
  });

  it("Zeilen aus `lead_regie_slots` (`session_id` leer bei einem Slot ohne Session) ergeben je Slot die richtige Antwort", () => {
    const slots = [{ session_id: "s1" }, { session_id: null }, { session_id: "s3" }];
    assert.deepEqual(slots.map(anweisungenMoeglich), [true, false, true]);
  });
});

describe("LEAD-057: die Liste", () => {
  it("ein Slot ohne Session: Zeit, „Noch keine Session“ und ein Satz — **kein** Feld, keine Technik-Ansage", () => {
    const q = zeile();
    const von = q.indexOf("if (!anweisungenMoeglich(slot)) {");
    assert.ok(von > 0, "Frühe Rückgabe fehlt");
    const bis = q.indexOf("\n  }\n", von);
    const leer = q.slice(von, bis);
    assert.match(leer, /\{hhmm\.format\(new Date\(slot\.start_at\)\)\}–\{hhmm\.format\(new Date\(slot\.end_at\)\)\}/);
    assert.match(leer, /<span className="ct-label text-muted">\{t\.regieNoSession\}<\/span>/);
    assert.match(leer, /<span className="ct-help">\{t\.regieEmptySlot\}<\/span>/);
    assert.doesNotMatch(leer, /feld\(|<Input|TechAnsage/);
  });

  it("die Rückgabe steht **vor** der ersten Eingabe: erst die Frage, dann die Felder", () => {
    const q = zeile();
    const frage = q.indexOf("if (!anweisungenMoeglich(slot)) {");
    const erstesFeld = q.indexOf('{feld("people_on_stage"');
    assert.ok(frage > 0 && erstesFeld > frage, "Reihenfolge Frage, Felder");
    // die Haken stehen weiter oben, vor jeder frühen Rückgabe
    assert.ok(q.indexOf("useState<Record<AnweisungFeld, string>>") < frage, "Hooks vor der frühen Rückgabe");
  });

  it("die Spalten gehen auf: neun in der Kopfzeile, die leere Zeile hat zwei Zellen und eine über sieben (2 + 7)", () => {
    const q = quelle(LISTE);
    const kopf = q.slice(q.indexOf("<Thead>"), q.indexOf("</Thead>"));
    assert.equal((kopf.match(/<Th>/g) ?? []).length, 9);
    const leer = zeile();
    assert.match(leer, /<Td colSpan=\{7\}>/);
    assert.equal(2 + 7, 9);
  });

  it("Slots mit Session bleiben, wie sie waren: fünf Felder, Speichern beim Verlassen, Technik-Ansage, Moderation", () => {
    const q = zeile();
    for (const k of ["people_on_stage", "mic", "media", "mobiliar", "notes"]) assert.ok(q.includes(`{feld("${k}"`), k);
    assert.match(q, /onBlur=\{\(\) => \{\s*if \(draft\[key\] === \(slot\[key\] \?\? ""\)\) return;\s*onSave\(slot\.slot_id, key, draft\[key\]\);/);
    assert.match(q, /<TechAnsage tech=\{slot\.tech\} t=\{p\} \/>/);
  });

  it("der Weg zum Speichern ist unverändert: dieselbe Server-Aktion, dieselbe Funktion, dieselben fünf Felder", () => {
    const a = quelle("components/regie/actions.ts");
    assert.match(a, /supabase\.rpc\("set_regie_anweisungen", \{ p_slot_id: slotId, p_data: data \}\)/);
    assert.match(quelle("components/regie/types.ts"), /export const ANWEISUNG_FELDER = \["people_on_stage", "mic", "media", "mobiliar", "notes"\] as const;/);
    // die Liste fragt weiter alle Slots der Bühnen ab — der leere Slot soll ja als Zeile dastehen
    assert.match(quelle("components/regie/load.ts"), /supabase\.rpc\("lead_regie_slots"\)/);
  });

  it("Admin-Weg: die Produktion plant Cues (auch ohne Session) weiter unter `/admin/regie` — dieselbe Regie, ein anderes Gate", () => {
    assert.match(quelle("app/(admin)/admin/regie/page.tsx"), /requireAdminSection\("regie", PATH\);\s*const \{ buehne, tag \} = await searchParams;\s*return <RegieSeite buehne=\{buehne\} tag=\{tag\} \/>;/);
    assert.match(quelle("app/(speaker-leads)/speaker-leads/regie/page.tsx"), /<Anweisungsliste\s/);
  });
});

describe("LEAD-057: Texte DE und EN", () => {
  type Woerterbuch = { leads: Record<string, string> };
  const de = JSON.parse(quelle("lib/i18n/de.json")) as Woerterbuch;
  const en = JSON.parse(quelle("lib/i18n/en.json")) as Woerterbuch;

  it("der Hinweis der leeren Zeile und „Noch keine Session“ stehen in beiden Sprachen", () => {
    for (const w of [de, en]) {
      assert.ok(w.leads.regieEmptySlot?.trim(), "regieEmptySlot");
      assert.ok(w.leads.regieNoSession?.trim(), "regieNoSession");
    }
    assert.equal(de.leads.regieEmptySlot, "Anweisungen tragt ihr ein, sobald eine Session im Slot steht.");
    assert.equal(en.leads.regieEmptySlot, "You can add directions once a session is in the slot.");
  });

  it("die Einleitung der Liste sagt, wann sich etwas eintragen lässt", () => {
    assert.match(de.leads.regieListLead, /eintragen lässt es sich, sobald eine Session im Slot steht/);
    assert.match(en.leads.regieListLead, /you can fill it in once a session is in the slot/);
  });
});

describe("LEAD-057: Doku", () => {
  it("Testleitfaden: die Zeile mit `/regie` beschreibt den leeren Slot ohne Felder", () => {
    const zeilen = quelle("docs/team-testleitfaden.md")
      .split("\n")
      .find((l) => l.startsWith("| `/anreise`, `/shuttle`, `/regie`, `/einreichungen` |"));
    assert.ok(zeilen, "Zeile fehlt");
    assert.match(zeilen, /Slot ohne Session steht als Zeile „Noch keine Session“ ohne Eingabefelder \(LEAD-057\)/);
  });

  it("Backlog: LEAD-057 trägt die PR-Nummer, sagt „keine Migration“ und nennt den Admin-Weg", () => {
    const zeile = quelle("docs/feedback/speaker-leads.md")
      .split("\n")
      .find((l) => l.startsWith("| LEAD-057 |"));
    assert.ok(zeile && /\| P2 \| (geplant|gebaut|abgenommen) #\d+/.test(zeile), "LEAD-057 trägt keine PR-Nummer");
    assert.match(zeile, /keine Migration/);
    assert.match(zeile, /`\/admin\/regie`/);
    assert.match(zeile, /anweisungenMoeglich/);
  });
});
