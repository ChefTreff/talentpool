import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * PART-113 (Konrad 08.10.2026, K-73): „So löst ihr eure Tickets ein“ ist **eine** Karte mit zwei nummerierten
 * Schritten direkt unter dem Code. Die Regel „ein Code für alle Tickets“ steht in Schritt 1, das „nicht vergessen“
 * ist eine Marke am Titel von Schritt 2; der Wortlaut aus PART-071 ist nur aufgeteilt, nichts entfällt. Es gibt keinen
 * DOM-Testlauf im Repo — das Bild vorher/nachher steht in der PR-Beschreibung, hier der Quelltext.
 */

const src = (p: string) => readFileSync(p, "utf8");
const ohneKommentare = (quelle: string) => quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const wb = (sprache: "de" | "en") => JSON.parse(src(`lib/i18n/${sprache}.json`)).partnerTickets as Record<string, string>;

const seite = ohneKommentare(src("app/(partner)/partner/tickets/TicketView.tsx"));
const von = seite.indexOf('<section aria-labelledby="h-einloesen">');
const bis = seite.indexOf("</section>", von) + "</section>".length;
const anleitung = seite.slice(von, bis);

describe("PART-113: Anleitung zum Einlösen", () => {
  it("steht direkt unter dem Code — vor den Kontingenten und den Anfragen", () => {
    assert.ok(von > 0, "Abschnitt fehlt");
    const code = seite.indexOf("t.codeTitle");
    assert.ok(code > 0 && code < von, "die Anleitung gehört unter den Code");
    assert.ok(von < seite.indexOf('aria-labelledby="h-kontingente"'), "vor den Kontingenten");
    assert.ok(von < seite.indexOf("{t.extraTitle}"), "vor den Anfragen");
    // Und nicht noch einmal ganz unten.
    assert.equal(seite.split("{t.howTitle}").length - 1, 1);
  });

  it("eine Karte, eine geordnete Liste, zwei Schritte mit Marke und `h3` in `ct-h3` — keine zweite Fläche, keine Aufzählung", () => {
    assert.equal((anleitung.match(/<Card>/g) ?? []).length, 1);
    assert.equal((anleitung.match(/<ol\b/g) ?? []).length, 1);
    assert.equal((anleitung.match(/<li\b/g) ?? []).length, 2);
    assert.match(anleitung, /<SchrittMarke nummer=\{1\} zustand="aktuell" \/>/);
    assert.match(anleitung, /<SchrittMarke nummer=\{2\} zustand="aktuell" \/>/);
    assert.match(anleitung, /<h3 className="ct-h3 text-ink">\{t\.step1Title\}<\/h3>/);
    assert.match(anleitung, /<h3 className="ct-h3 text-ink">\{t\.step2Title\}<\/h3>/);
    assert.doesNotMatch(anleitung, /<ul\b/);
    assert.doesNotMatch(anleitung, /rounded-ct-md border border-border bg-surface/);
    assert.match(anleitung, /<h2 id="h-einloesen" className="ct-h2 mb-3 text-ink">/);
  });

  it("Schritt 2 trägt „Nicht vergessen“ als Marke (`warning`) hinter dem Titel, nicht als Teil des Titels", () => {
    assert.match(anleitung, /<h3 className="ct-h3 text-ink">\{t\.step2Title\}<\/h3>\s*<Badge tone="warning">\{t\.step2Flag\}<\/Badge>/);
  });

  it("Schritt 1 sagt der Reihe nach: was zu tun ist, welcher Code für wen ist (zwei Einträge), wem man ihn gibt", () => {
    const reihe = ["{t.step1Body}", "{t.ruleCodes}", "<InfoList", "t.ruleCodesPartnerLabel", "t.ruleCodesTalentLabel", "{t.ruleCodesClose}", "{t.step2Title}"];
    let ab = 0;
    for (const stelle of reihe) {
      const i = anleitung.indexOf(stelle, ab);
      assert.ok(i >= ab, `${stelle} steht nicht an seiner Stelle`);
      ab = i;
    }
    assert.match(anleitung, /\{ key: "partner", label: t\.ruleCodesPartnerLabel, value: t\.ruleCodesPartner \}/);
    assert.match(anleitung, /\{ key: "talent", label: t\.ruleCodesTalentLabel, value: t\.ruleCodesTalent \}/);
  });

  it("die Nummer macht die Marke: kein „1 ·“ im Titel, kein Gedankenstrich im Titel von Schritt 2", () => {
    for (const sprache of ["de", "en"] as const) {
      const t = wb(sprache);
      assert.doesNotMatch(t.step1Title, /^\d|·/, sprache);
      assert.doesNotMatch(t.step2Title, /^\d|·|—/, sprache);
      assert.ok(t.step2Flag.length > 0 && t.step2Flag.length < 24, `${sprache}: step2Flag ist eine Marke, kein Satz`);
    }
  });

  it("der Wortlaut aus PART-071 ist da, nur aufgeteilt (nichts entfällt)", () => {
    const de = wb("de");
    const alles = [de.ruleCodes, de.ruleCodesPartnerLabel, de.ruleCodesPartner, de.ruleCodesTalentLabel, de.ruleCodesTalent, de.ruleCodesClose].join(" ");
    for (const stelle of [
      "Ein Code für alle Tickets",
      "Partner-Tickets",
      "Standpersonal, Masterclass und alle, die euch auf dem Summit vertreten",
      "Talent-Tickets",
      "Studierende, Auszubildende und junge Talente aus eurem Unternehmen",
      "Bewerberinnen und Bewerber, die ihr in entspanntem Rahmen kennenlernen möchtet",
      "Wer den Code einlöst, wählt die Art des Tickets im Shop selbst; gebt ihn deshalb nur an Personen weiter, die ihn auch so verwenden sollen.",
    ]) {
      assert.ok(alles.includes(stelle), `fehlt: ${stelle}`);
    }
    const en = wb("en");
    const allEn = [en.ruleCodes, en.ruleCodesPartnerLabel, en.ruleCodesPartner, en.ruleCodesTalentLabel, en.ruleCodesTalent, en.ruleCodesClose].join(" ");
    for (const stelle of [
      "One code for all tickets",
      "booth staff, masterclass and everyone representing you at the summit",
      "students, apprentices and young talent from your company",
      "applicants you would like to meet in a relaxed setting",
      "Whoever redeems the code chooses the ticket type in the shop themselves, so only pass it on to people who should use it that way.",
    ]) {
      assert.ok(allEn.includes(stelle), `missing: ${stelle}`);
    }
  });

  it("Schritt 1 und 2 sind unverändert (Konrads Sätze), und die Regel „eigenes Ticket“ steht weiter nur oben bei den Hinweisen", () => {
    assert.match(wb("de").step1Body, /^Öffnet den Ticketshop, klickt auf „Tickets kaufen“ und gebt euren Code ein\./);
    assert.match(wb("de").step2Body, /Ohne eigene Adresse bekommt die Person keinen Zugang zur Event-App\.$/);
    assert.doesNotMatch(anleitung, /ruleOwnTicket/);
  });
});
