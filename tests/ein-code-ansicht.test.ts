import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { aufzaehlung, ticketCodes } from "@/components/partner/ticket-codes";
import { geschwister, nachGruppen, type KontingentZeile } from "@/components/partner/kontingent-ansicht";
import type { TicketAllocationRow } from "@/app/(partner)/partner/types";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const wb = (sprache: "de" | "en") => JSON.parse(src(`lib/i18n/${sprache}.json`));

const kontingent = (id: string, pass_type: string, status: TicketAllocationRow["status"], coupon_code: string | null) => ({ id, pass_type, status, coupon_code });

describe("PART-111: die Codes, die der Partner sieht", () => {
  it("alle Kontingente mit demselben Code ergeben **einen** Code mit allen Kategorien", () => {
    const codes = ticketCodes([
      kontingent("1", "partner", "active", "FLS27-ERFOLG-AB12CD"),
      kontingent("2", "talent", "active", "FLS27-ERFOLG-AB12CD"),
    ]);
    assert.deepEqual(codes, [{ code: "FLS27-ERFOLG-AB12CD", passTypes: ["partner", "talent"] }]);
  });

  it("ein anderer Code — die 50-%-Stufe oder der Altbestand — bekommt seinen eigenen Eintrag, in der Reihenfolge des Auftretens", () => {
    const codes = ticketCodes([
      kontingent("1", "partner", "active", "A"),
      kontingent("2", "partner", "active", "B"),
      kontingent("3", "talent", "active", "A"),
    ]);
    assert.deepEqual(codes, [
      { code: "A", passTypes: ["partner", "talent"] },
      { code: "B", passTypes: ["partner"] },
    ]);
  });

  it("ausstehende und fehlerhafte Kontingente tragen keinen Code, eine Kategorie zählt nie doppelt", () => {
    assert.deepEqual(ticketCodes([kontingent("1", "partner", "pending_vivenu", null), kontingent("2", "talent", "error", null)]), []);
    // Die RPC liefert den Code nur bei `active`; käme er doch mit, würde er nicht gezeigt.
    assert.deepEqual(ticketCodes([kontingent("1", "partner", "error", "X")]), []);
    assert.deepEqual(ticketCodes([kontingent("1", "partner", "active", "X"), kontingent("2", "partner", "active", "X")]), [{ code: "X", passTypes: ["partner"] }]);
    assert.deepEqual(ticketCodes([kontingent("1", "partner", "active", null)]), []);
  });

  it("die Aufzählung folgt der Sprache der Seite — mit „und“ bzw. „and“", () => {
    assert.equal(aufzaehlung(["Partner", "Talent"], "de-DE"), "Partner und Talent");
    assert.equal(aufzaehlung(["Partner", "Talent", "Startup"], "de-DE"), "Partner, Talent und Startup");
    assert.equal(aufzaehlung(["Partner", "Talent"], "en-GB"), "Partner and Talent");
    assert.equal(aufzaehlung(["Partner"], "de-DE"), "Partner");
  });
});

describe("PART-111: Kontingente als Gruppen in der Admin-Tabelle", () => {
  const z = (id: string, org: string, pass: string, status: string, rabatt = 100, edition = "ed1"): KontingentZeile => ({
    id, org_id: org, org_name: org.toUpperCase(), edition_id: edition, discount_percent: rabatt, pass_type: pass, status,
    coupon_code: status === "active" ? "X" : null,
  });

  it("eine Gruppe steht beisammen, ihr Kopf ist die erste Zeile, innerhalb nach Kategorie", () => {
    const aus = nachGruppen([z("1", "b", "talent", "active"), z("2", "a", "partner", "active"), z("3", "b", "partner", "active")]);
    assert.deepEqual(aus.map((x) => [x.zeile.id, x.kopf]), [["2", true], ["3", true], ["1", false]]);
  });

  it("eine Gruppe mit einem Fehler steht oben, auch wenn ihre anderen Zeilen aktiv sind", () => {
    const aus = nachGruppen([z("1", "a", "partner", "active"), z("2", "b", "partner", "active"), z("3", "b", "investor", "error")]);
    // Die Zeilen derselben Gruppe bleiben zusammen (b: partner, investor), erst danach die gesunde Gruppe a.
    assert.deepEqual(aus.map((x) => x.zeile.id), ["2", "3", "1"]);
    assert.deepEqual(aus.map((x) => x.zeile.org_id), ["b", "b", "a"]);
  });

  it("der Kopf einer Gruppe ist die erste Zeile mit Code — nicht eine fehlerhafte ohne, die nach der Kategorie vorne läge (Konrads Testorganisation)", () => {
    // investor steht alphabetisch vor partner und talent, hat aber keinen Tickettyp und keinen Code.
    const aus = nachGruppen([z("3", "a", "investor", "error"), z("2", "a", "talent", "active"), z("1", "a", "partner", "active")]);
    assert.deepEqual(aus.map((x) => [x.zeile.id, x.kopf]), [["1", true], ["2", false], ["3", false]]);
    assert.equal(aus[0].zeile.coupon_code, "X", "an der Kopfzeile stehen Code und Link");
  });

  it("hat keine Zeile der Gruppe einen Code, ist der Kopf die erste nach Kategorie — dort kann ein Code von Hand eingetragen werden", () => {
    const aus = nachGruppen([z("2", "a", "talent", "pending_vivenu"), z("1", "a", "partner", "pending_vivenu")]);
    assert.deepEqual(aus.map((x) => [x.zeile.id, x.kopf]), [["1", true], ["2", false]]);
  });

  it("die Rabattstufen einer Organisation sind getrennte Gruppen mit je eigenem Kopf, 100 % vor 50 %", () => {
    const aus = nachGruppen([z("1", "a", "partner", "active", 50), z("2", "a", "partner", "active", 100), z("3", "a", "talent", "active", 100)]);
    assert.deepEqual(aus.map((x) => [x.zeile.id, x.kopf]), [["2", true], ["3", false], ["1", true]]);
  });

  it("die Geschwister einer Zeile: dieselbe Organisation, Edition und Rabattstufe, ohne sie selbst und ohne Abgeschaltete", () => {
    const rows = [
      z("1", "a", "partner", "active"),
      z("2", "a", "talent", "active"),
      z("3", "a", "startup", "disabled"),
      z("4", "a", "partner", "active", 50),
      z("5", "b", "partner", "active"),
      z("6", "a", "partner", "active", 100, "ed2"),
    ];
    assert.deepEqual(geschwister(rows, "1").map((x) => x.id), ["2"]);
    assert.deepEqual(geschwister(rows, "2").map((x) => x.id), ["1"]);
    assert.deepEqual(geschwister(rows, "4").map((x) => x.id), [], "die 50-%-Stufe hat einen eigenen Coupon");
    assert.deepEqual(geschwister(rows, "unbekannt"), []);
  });
});

describe("PART-111: Partner-Seite, Admin-Tabelle und Texte", () => {
  const ansicht = src("app/(partner)/partner/tickets/TicketView.tsx");
  const tabelle = src("app/(admin)/admin/partner/kontingente/AllocationTable.tsx");
  const actions = src("app/(admin)/admin/partner/actions.ts");

  it("die Partner-Seite zeigt den Code einmal, mit Knopf in den Shop, und die Kontingente darunter ohne eigenen Code", () => {
    assert.match(ansicht, /const codes = ticketCodes\(allocations\);/);
    assert.match(ansicht, /codes\.map\(\(c, i\) => \(/);
    assert.match(ansicht, /i === 0 \? t\.codeTitle : t\.codeTitleMore/);
    assert.match(ansicht, /<ButtonLink href=\{shopUrl\} variant="secondary" \{\.\.\.neuesFenster\}>/);
    // Die Karten je Kategorie tragen keinen Code mehr.
    const karten = ansicht.slice(ansicht.indexOf('id="h-kontingente"'));
    assert.doesNotMatch(karten, /coupon_code|onCopy/);
    assert.match(karten, /a\.status !== "active" && codes\.length > 0/);
    // Es gibt weiter genau einen primären Shop-Knopf oben (PART-067) und einen sekundären im Code.
    assert.equal((ansicht.match(/<ButtonLink href=\{shopUrl\}/g) ?? []).length, 2);
  });

  it("ohne Code steht der Satz „Code kommt noch“ an seiner Stelle — nicht auf jeder Karte", () => {
    assert.match(ansicht, /codes\.length === 0 \? \(\s*<Card>\s*<CardHeader ebene="h2" title=\{t\.codeTitle\} description=\{t\.codesPending\} \/>/);
  });

  it("die Admin-Tabelle bearbeitet Code und Link nur an der ersten Zeile einer Gruppe und gibt sie nur von dort mit", () => {
    assert.match(tabelle, /nachGruppen\(rows\)\.map\(\(\{ zeile: a, kopf \}\)/);
    assert.match(tabelle, /couponCode: kopf \? d\.code\.trim\(\) \|\| null : null,/);
    assert.match(tabelle, /undershopUrl: kopf \? d\.url\.trim\(\) \|\| null : null,/);
    assert.match(tabelle, /onClick=\{\(\) => onSave\(a, kopf\)\}/);
    assert.match(tabelle, /t\.codeSameAbove/);
  });

  it("die Action überträgt Code und Link auf die Geschwister, die der Server selbst bestimmt", () => {
    const rumpf = actions.slice(actions.indexOf("export async function saveAllocation("), actions.indexOf("export async function saveAllocationDiscount("));
    assert.match(rumpf, /if \(input\.couponCode != null \|\| input\.undershopUrl != null\) \{/);
    assert.match(rumpf, /supabase\.rpc\("ticket_allocations_admin"\)/);
    assert.match(rumpf, /for \(const z of geschwister\(\(rows \?\? \[\]\) as AdminAllocation\[\], input\.id\)\)/);
    // Auf den Geschwistern ändern sich nur Code und Link, nie Menge, Status oder Notiz.
    const schleife = rumpf.slice(rumpf.indexOf("for (const z of geschwister"));
    assert.match(schleife, /p_quantity: null,[\s\S]*p_status: null,\s*p_notes: null,/);
  });

  it("die Texte nennen keinen Partner-Code und Talent-Code mehr und sagen, dass man die Kategorie im Shop wählt", () => {
    for (const sprache of ["de", "en"] as const) {
      const t = wb(sprache).partnerTickets;
      assert.doesNotMatch(t.step1Body, /Partner-Code|Talent-Code|partner code|talent code/i, sprache);
      assert.doesNotMatch(t.ruleCodes, /Der Partner-Code|Der Talent-Code|The partner code|The talent code/, sprache);
      assert.match(t.step1Body, sprache === "de" ? /wählt ihr für jede Person die Art des Tickets/ : /choose the type of ticket for each person/);
      assert.match(t.ruleCodes, sprache === "de" ? /^Ein Code für alle Tickets/ : /^One code for all tickets/);
      assert.equal("code" in t, false, `${sprache}: partnerTickets.code ist entfernt`);
      for (const k of ["codeTitle", "codeTitleMore", "codeBody", "codeCovers", "rowPending", "allocationsTitle"]) assert.ok(t[k], `${sprache}: ${k}`);
      assert.match(t.codeCovers, /\{types\}/, sprache);
      const a = wb(sprache).adminPartner;
      for (const k of ["codeShared", "codeSameAbove"]) assert.ok(a[k], `${sprache}: adminPartner.${k}`);
    }
  });

  it("die Texte des Wörterbuchs tragen keine Sternchen (Wächter der Wörterbücher)", () => {
    for (const sprache of ["de", "en"] as const) {
      const t = wb(sprache).partnerTickets;
      for (const k of ["step1Body", "ruleCodes", "codeBody", "codeCovers", "rowPending", "codeTitle", "codeTitleMore", "allocationsTitle"]) {
        assert.doesNotMatch(t[k], /\*\*|`/, `${sprache}: ${k}`);
      }
    }
  });

  it("die Testdaten für Konrads Organisation tragen einen gemeinsamen Code statt einen je Kategorie", () => {
    const skript = src("scripts/testdaten-konrad.mjs");
    assert.match(skript, /coupon_code: `FLS27-\$\{PREFIX_CODE\}`,/);
    assert.doesNotMatch(skript, /coupon_code: `FLS27-\$\{PREFIX_CODE\}-\$\{p\.pass_type/);
  });

  it("der Lauf hängt nicht an `server-only` und nimmt vom vivenu-Client nur Typen; der Umschlag setzt die echten Aufrufe ein", () => {
    const lauf = src("lib/vivenu/kontingent-lauf.ts");
    assert.doesNotMatch(lauf, /import "server-only"/);
    assert.doesNotMatch(lauf, /^import \{[^}]*\} from "@\/lib\/vivenu\/client";/m, "kein Wert-Import aus dem Client");
    assert.match(lauf, /^import type \{[^}]*\} from "@\/lib\/vivenu\/client";/m);
    const umschlag = src("lib/vivenu/allocations.ts");
    assert.match(umschlag, /^import "server-only";/);
    assert.match(umschlag, /laufe\(\{ hasVivenuKey, getEvent, putUnderShops, createCoupon, updateCoupon \}, admin, jobId, only\)/);
  });
});
