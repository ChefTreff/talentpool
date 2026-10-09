import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ticketHinweise } from "@/components/partner/ticket-hinweise";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerter = (sprache: "de" | "en") =>
  (JSON.parse(src(`lib/i18n/${sprache}.json`)) as Record<string, Record<string, string>>).partnerTickets;

/**
 * PART-112 (Konrad und Leopold 05.10.): zwei Hinweise auf der Ticketseite — jede Person braucht ein eigenes Ticket (kein
 * Wechsel zwischen Personen an Tag 1 und Tag 2), und mehr Tickets fürs Standpersonal gibt es über „Mehr Tickets
 * anfragen“. Welche Zeilen erscheinen, entscheidet `ticketHinweise` und läuft hier wirklich; wo sie auf der Seite
 * stehen, belegt der Quelltext (und die Vorschau im Browser).
 */
describe("PART-112: Hinweise oben auf der Ticketseite", () => {
  for (const sprache of ["de", "en"] as const) {
    const t = woerter(sprache);

    it(`${sprache}: mit Recht zum Anfragen zwei Hinweise — erst das eigene Ticket, dann der Knopf beim Namen`, () => {
      const zeilen = ticketHinweise(t, true);
      assert.equal(zeilen.length, 2);
      assert.equal(zeilen[0], t.ruleOwnTicket);
      assert.ok(zeilen[1].includes(`„${t.requestTitle}“`) || zeilen[1].includes(`“${t.requestTitle}”`), zeilen[1]);
      assert.ok(!zeilen[1].includes("{button}"), "Platzhalter ist übrig");
    });

    it(`${sprache}: ohne das Recht nur der Hinweis zum eigenen Ticket — der Knopf, auf den der zweite zeigt, fehlt`, () => {
      const zeilen = ticketHinweise(t, false);
      assert.deepEqual(zeilen, [t.ruleOwnTicket]);
      assert.ok(!zeilen.join(" ").includes(t.requestTitle));
    });
  }

  it("der Hinweis zum eigenen Ticket nennt den Wechsel des Standpersonals zwischen den Tagen (Konrads Satz bleibt)", () => {
    assert.match(woerter("de").ruleOwnTicket, /Jede Person braucht ein eigenes Ticket/);
    assert.match(woerter("de").ruleOwnTicket, /Standpersonal an beiden Tagen/);
    assert.match(woerter("en").ruleOwnTicket, /Every person needs their own ticket/);
    assert.match(woerter("en").ruleOwnTicket, /booth staff who change between the two days/);
  });

  it("der Hinweis zum Standpersonal nennt es und hat Platz für den Namen des Knopfes", () => {
    assert.match(woerter("de").ruleMoreTickets, /Standpersonal/);
    assert.match(woerter("en").ruleMoreTickets, /booth staff/);
    for (const sprache of ["de", "en"] as const) assert.match(woerter(sprache).ruleMoreTickets, /\{button\}/, sprache);
  });

  it("Überschrift und beide Hinweise gibt es in DE und EN", () => {
    for (const sprache of ["de", "en"] as const) {
      for (const key of ["hintsTitle", "ruleOwnTicket", "ruleMoreTickets", "requestTitle"]) {
        assert.ok(woerter(sprache)[key]?.trim(), `${sprache}: partnerTickets.${key}`);
      }
    }
  });

  it("Quelltext: die Hinweise stehen oben — nach den Knöpfen und der Anfrage, vor der Frist und den Codes", () => {
    const seite = src("app/(partner)/partner/tickets/TicketView.tsx");
    const hinweise = seite.indexOf("{t.hintsTitle}");
    assert.ok(hinweise > 0, "Überschrift fehlt");
    assert.ok(seite.indexOf("{t.requestTitle}") < hinweise, "die Hinweise müssen nach den Knöpfen stehen");
    assert.ok(seite.indexOf("{canRequest && asking && (") < hinweise, "die Hinweise müssen nach der Anfrage stehen");
    assert.ok(hinweise < seite.indexOf("<DeadlineCard"), "die Hinweise müssen vor der Frist stehen");
    assert.ok(hinweise < seite.indexOf("<TicketCard"), "die Hinweise müssen vor den Kontingenten stehen");
    assert.match(seite, /ticketHinweise\(t, canRequest\)/);
  });

  it("Quelltext: die Regel steht nicht zweimal auf der Seite — die Anleitung nennt nur, welcher Code für wen ist (PART-113)", () => {
    const seite = src("app/(partner)/partner/tickets/TicketView.tsx");
    assert.doesNotMatch(seite, /t\.ruleOwnTicket/);
    assert.match(seite, /<p className="ct-label mt-4 text-ink">\{t\.ruleCodes\}<\/p>/);
    assert.doesNotMatch(seite, /<li>\{t\.ruleCodes\}<\/li>/);
  });
});
