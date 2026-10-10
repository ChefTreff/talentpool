import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { naechstesOffene, zustaendeVon } from "@/lib/vivenu/bestaetigung";

/**
 * TAL-020 (Design-Befund 10.10.2026, `docs/design-befund-tickets-2026-10-10.md`), Teil 2: B4 eine Karte nach der anderen mit Fortschritt, B5 „Und jetzt?“ nur mit
 * einer primären Aktion, B6 Weg bei falscher Adresse, B7 Fokus und Statuszeile, B9 Ein-/Mehrzahl, B10 Rückfrage vor dem Verlassen, B12 Texte der Admin-Seite.
 * Die Auswahl der nächsten Karte ist eine reine Funktion (`lib/vivenu/bestaetigung.ts`), alles Übrige wird am Quelltext geprüft — Komponenten lädt der Testlader nicht.
 */
const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ohneKommentare = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const drei = [{ ticket_id: "a" }, { ticket_id: "b" }, { ticket_id: "c" }];

describe("TAL-020 B4: welche Karte kommt als Nächste?", () => {
  it("der Zustand aller Tickets nach Kennung; Unbekanntes zählt als offen", () => {
    assert.deepEqual(
      zustaendeVon([
        { ticket_id: "a", personalization_status: "complete" },
        { ticket_id: "b", personalization_status: "partial" },
        { ticket_id: "c", personalization_status: "komisch" },
      ]),
      { a: "complete", b: "partial", c: "pending" },
    );
  });

  it("ohne Vorgänger das erste Ticket, das nicht vollständig ist — vollständige werden übersprungen", () => {
    assert.equal(naechstesOffene(drei, { a: "pending", b: "pending", c: "pending" }, null), "a");
    assert.equal(naechstesOffene(drei, { a: "complete", b: "partial", c: "pending" }, null), "b");
    assert.equal(naechstesOffene(drei, { a: "complete", b: "complete", c: "complete" }, null), null);
  });

  it("nach einem Ticket das nächste unvollständige dahinter — ein teilweise gespeichertes zählt als offen", () => {
    assert.equal(naechstesOffene(drei, { a: "complete", b: "partial", c: "pending" }, "a"), "b");
    assert.equal(naechstesOffene(drei, { a: "complete", b: "complete", c: "pending" }, "a"), "c");
    assert.equal(naechstesOffene(drei, { a: "pending", b: "pending", c: "pending" }, "a"), "b", "es zählt, was hinter dem Ticket kommt, nicht das erste offene überhaupt");
    assert.equal(naechstesOffene(drei, { a: "pending", b: "pending", c: "pending" }, "b"), "c");
  });

  it("es wird nicht von vorn weitergesucht: wer das letzte Ticket überspringt, kommt nicht im Kreis zum ersten zurück", () => {
    assert.equal(naechstesOffene(drei, { a: "pending", b: "complete", c: "pending" }, "c"), null);
    assert.equal(naechstesOffene(drei, { a: "pending", b: "pending", c: "pending" }, "c"), null);
  });

  it("eine unbekannte Kennung wirkt wie „von vorn“", () => {
    assert.equal(naechstesOffene(drei, { a: "pending", b: "pending", c: "pending" }, "x"), "a");
  });
});

describe("TAL-020 B4, B5, B7, B10: die Ansicht (Quelltext)", () => {
  const ansicht = ohneKommentare(lies("app/tickets/bestaetigung/BestaetigungView.tsx"));
  const karte = ansicht.slice(ansicht.indexOf("function TicketKarte("));
  const view = ansicht.slice(0, ansicht.indexOf("function TicketKarte("));

  it("B4: beim Laden ist nur das erste noch nicht vollständige Ticket aufgeklappt", () => {
    assert.match(view, /const erstes = naechstesOffene\(tickets, zustaendeVon\(tickets\), null\);/);
    assert.match(view, /Object\.fromEntries\(tickets\.map\(\(k\) => \[k\.ticket_id, k\.ticket_id === erstes\]\)\)/);
    assert.doesNotMatch(karte, /useState\(zustand !== "complete"\)/, "jede Karte öffnet sich selbst wieder, wenn sie nicht vollständig ist");
  });

  it("B4: nach dem Speichern und nach dem Überspringen öffnet sich die nächste Karte — ohne im Kreis zu laufen", () => {
    assert.match(view, /const naechstes = naechstesOffene\(tickets, stand, id\);/);
    assert.match(view, /setOffen\(\(o\) => \(\{ \.\.\.o, \[id\]: false, \.\.\.\(naechstes \? \{ \[naechstes\]: true \} : \{\}\) \}\)\);/);
    assert.match(view, /onUeberspringen=\{\(\) => weiter\(k\.ticket_id, zustaende\)\}/);
    assert.match(view, /onGespeichert=\{\(z\) => gespeichert\(k\.ticket_id, z\)\}/);
  });

  it("B4: über der Liste steht ab zwei Tickets „x von n vollständig“ (Kit `Fortschritt`, immer mit der Zahl)", () => {
    assert.match(view, /\{tickets\.length > 1 && \(\s*<Fortschritt\s+wert=\{fertig\}\s+gesamt=\{tickets\.length\}\s+label=\{t\.progress\.replace\("\{done\}", String\(fertig\)\)\.replace\("\{n\}", String\(tickets\.length\)\)\}/);
  });

  it("B4: eine zugeklappte Karte ist eine Zeile — der Knopf steht neben dem Titel und trägt den Bezug im Namen („Ausfüllen: Ticket 2 · …“)", () => {
    assert.match(karte, /aria-label=\{`\$\{gespeichert \? t\.edit : t\.fill\}: \$\{titel\}`\}/);
    assert.match(karte, /className="sm:ml-auto"/);
    assert.match(karte, /gespeichert && \(\s*<p className="ct-small mt-2">/, "die Zusammenfassung nur bei gespeicherten Angaben");
  });

  it("B4: ein gespeichertes Ticket bietet „Abbrechen“ und stellt den gespeicherten Stand wieder her; nur ein ungespeichertes „Vorerst überspringen“", () => {
    assert.match(karte, /\{gespeichert \? \(\s*<Button type="button" variant="ghost" onClick=\{abbrechen\} disabled=\{pending\}>\{t\.cancel\}<\/Button>/);
    assert.match(karte, /onClick=\{onUeberspringen\} disabled=\{pending\}>\{t\.skip\}/);
    assert.match(karte, /function abbrechen\(\) \{\s*setFuerMich\(basis\.fuerMich\);\s*setV\(basis\.v\);/);
  });

  it("B5: „Und jetzt?“ ist weg — die Abschlusskarte mit den drei Aktionen steht erst, wenn alle Tickets vollständig sind; davor nur „Zu meinen Tickets“, nicht primär", () => {
    assert.doesNotMatch(view, /nextTitle|nextBody/);
    const abschluss = view.slice(view.indexOf("{alleFertig ? ("));
    const wenn = abschluss.slice(0, abschluss.indexOf(") : ("));
    const sonst = abschluss.slice(abschluss.indexOf(") : ("));
    assert.match(wenn, /<ButtonLink href="\/profil">\{t\.nextProfile\}<\/ButtonLink>/, "die eine primäre Aktion steht in der Abschlusskarte");
    assert.equal((sonst.match(/<ButtonLink/g) ?? []).length, 1);
    assert.match(sonst, /<ButtonLink href="\/tickets" variant="ghost">\{t\.toTickets\}<\/ButtonLink>/);
    assert.doesNotMatch(sonst, /nextProfile|nextProgramme/);
  });

  it("B7: der Titel einer Karte nimmt den Fokus an (`tabIndex={-1}`), und ein Wunsch des Elternbausteins setzt ihn — ohne `setState` im Effekt", () => {
    assert.match(karte, /<h2 ref=\{ueberschrift\} tabIndex=\{-1\} className="ct-h3 text-ink">\{titel\}<\/h2>/);
    assert.match(karte, /useEffect\(\(\) => \{\s*if \(fokus\) ueberschrift\.current\?\.focus\(\);\s*\}, \[fokus\]\);/);
    assert.match(view, /fokus=\{wunsch\?\.id === k\.ticket_id \? wunsch : null\}/);
    assert.match(view, /const will = \(id: string\) => setWunsch\(\(w\) => \(\{ id, n: \(w\?\.n \?\? 0\) \+ 1 \}\)\);/);
  });

  it("B7: nach der letzten Karte bekommt die Abschlusskarte den Fokus (alles vollständig), sonst die Karte selbst", () => {
    assert.match(view, /will\(naechstes \?\? \(tickets\.every\(\(k\) => stand\[k\.ticket_id\] === "complete"\) \? FERTIG : id\)\);/);
    assert.match(view, /<h2 ref=\{fertigRef\} tabIndex=\{-1\} className="ct-h3 text-ink">\{t\.nextDone\}<\/h2>/);
    assert.match(view, /if \(wunsch\?\.id === FERTIG\) fertigRef\.current\?\.focus\(\);/);
  });

  it("B7: „Ausfüllen“ und „Ändern“ öffnen die Karte und setzen den Fokus auf ihren Titel — der Knopf verschwindet sonst unter dem Fokus", () => {
    assert.match(view, /function oeffne\(id: string\) \{\s*setOffen\(\(o\) => \(\{ \.\.\.o, \[id\]: true \}\)\);\s*will\(id\);/);
  });

  it("B7: die Statuszeile steht immer im Baum (leer nur für Vorlesegeräte), damit „Gespeichert …“ gemeldet wird", () => {
    assert.match(karte, /<p role="status" className=\{hinweis \? "ct-small mt-2 text-success-ink" : "sr-only"\}>\{hinweis\}<\/p>/);
    assert.doesNotMatch(karte, /\{hinweis && <p role="status"/);
  });

  it("B10: wer Eingaben hat und die Seite verlässt, wird gefragt — gegen den Stand beim Laden und nach dem Speichern; ein Fänger je Karte, der erste bricht den Klick ab", () => {
    assert.match(karte, /const geaendert = offen && \(fuerMich !== basis\.fuerMich \|\| \(Object\.keys\(v\)/);
    assert.match(karte, /const warnung = useUngesichert\(geaendert, unsaved\);/);
    assert.match(karte, /\{warnung\}/);
    assert.match(karte, /setBasis\(\{ fuerMich, v \}\);/, "nach dem Speichern gilt der gespeicherte Stand");
    assert.match(ansicht, /import \{ useUngesichert, type UngesichertTexte \} from "@\/components\/ui\/useUngesichert";/);
  });

  it("B9: ein Ticket sagt „ein Ticket“, mehrere „{n} Tickets“ — kein „Ticket(s)“ mehr", () => {
    assert.match(view, /tickets\.length === 1 \? t\.leadOne : t\.lead\.replace\("\{n\}", String\(tickets\.length\)\)/);
  });
});

describe("TAL-020 B6: Weg bei falscher Adresse (Seite, Aktion, Kopfzeile)", () => {
  const seite = ohneKommentare(lies("app/tickets/bestaetigung/page.tsx"));
  const aktion = ohneKommentare(lies("app/tickets/bestaetigung/actions.ts"));
  const kopf = ohneKommentare(lies("components/layout/AppHeader.tsx"));
  const anders = aktion.slice(aktion.indexOf("export async function anderesKonto"));

  it("die leere Seite bietet „Mit anderer E-Mail-Adresse anmelden“ als Formular mit der Bestellung an die Aktion gebunden", () => {
    assert.match(seite, /<form action=\{anderesKonto\.bind\(null, tx\)\}>\s*<Button type="submit" variant="ghost">\{b\.otherAccount\}<\/Button>\s*<\/form>/);
    assert.match(seite, /import \{ anderesKonto \} from "\.\/actions";/);
  });

  it("die Aktion meldet nur die Sitzung ab und führt zur Anmeldung derselben Bestellung zurück — Kennung geprüft, Rücksprung über `loginUrl`, sonst nichts gelesen oder geschrieben", () => {
    assert.match(anders, /const tx = gueltigeTransaktion\(transaktion\);/);
    assert.match(anders, /await supabase\.auth\.signOut\(\);/);
    assert.match(anders, /redirect\(loginUrl\(tx \? `\/tickets\/bestaetigung\?transactionId=\$\{encodeURIComponent\(tx\)\}` : null\)\);/);
    assert.doesNotMatch(anders, /\.from\(|\.rpc\(|createSupabaseAdminClient/);
  });

  it("im Gate führt auch der Link der Kopfzeile mit Rücksprung zur Bestellung — vorher ging er ohne `next` auf `/login`", () => {
    assert.match(seite, /const huelle = \(inhalt: React\.ReactNode, loginHref\?: string\) => \(\s*<>\s*<AppHeader loginHref=\{loginHref\} \/>/);
    assert.match(seite, /<ButtonLink href=\{zumLogin\}>\{b\.login\}<\/ButtonLink>[\s\S]*?<\/>,\s*zumLogin,\s*\);/);
    assert.match(kopf, /AppHeader\(\{ current, loginHref \}: \{ current\?: AreaKey; loginHref\?: string \}\)/);
    assert.match(kopf, /href=\{loginHref \?\? "\/login"\}/);
  });

  it("die Seite reicht die Texte der Rückfrage an die Ansicht weiter", () => {
    assert.match(seite, /unsaved=\{t\.common\.unsaved\}/);
  });
});

describe("TAL-020 B4, B6, B9, B12: Texte (DE und EN)", () => {
  const de = JSON.parse(lies("lib/i18n/de.json")) as { ticketBestaetigung: Record<string, string>; admin: { applications: Record<string, string> } };
  const en = JSON.parse(lies("lib/i18n/en.json")) as { ticketBestaetigung: Record<string, string>; admin: { applications: Record<string, string> } };

  it("die neuen Texte stehen in beiden Sprachen, die alten „Und jetzt?“-Texte und der Satz zum Überspringen sind weg", () => {
    for (const w of [de, en]) {
      for (const k of ["progress", "leadOne", "lead", "cancel", "otherAccount"]) assert.ok(w.ticketBestaetigung[k], k);
      for (const k of ["nextTitle", "nextBody", "skippedText"]) assert.equal(k in w.ticketBestaetigung, false, `${k} ist noch da`);
    }
  });

  it("B9: Ein- und Mehrzahl — „ein Ticket“ ohne Platzhalter, „{n} Tickets“ ohne „(s)“", () => {
    for (const w of [de, en]) {
      assert.doesNotMatch(w.ticketBestaetigung.leadOne, /\{n\}|\(s\)/);
      assert.match(w.ticketBestaetigung.lead, /\{n\}/);
      assert.doesNotMatch(w.ticketBestaetigung.lead, /\(s\)/);
    }
  });

  it("der Fortschritt trägt beide Platzhalter", () => {
    for (const w of [de, en]) {
      assert.match(w.ticketBestaetigung.progress, /\{done\}/);
      assert.match(w.ticketBestaetigung.progress, /\{n\}/);
    }
  });

  it("B12: Admin-Seite — kurze Überschrift statt Frage, „Gesamt“ statt „Σ“, „Übertragung“ statt „Rückschreiben“, eigener Satz für „noch keine Tickets“", () => {
    const seite = ohneKommentare(lies("app/(admin)/admin/bewerbungen/tickets/page.tsx"));
    assert.equal(de.admin.applications.ticketsTitle, "Tickets");
    assert.doesNotMatch(de.admin.applications.ticketsTitle, /\?/);
    assert.doesNotMatch(seite, /Σ/);
    assert.match(seite, /<Td className="font-semibold">\{a\.ticketsTotal\}<\/Td>/);
    assert.match(seite, /<EmptyState title=\{a\.ticketsNoData\} description=\{a\.ticketsNoDataBody\} \/>/);
    for (const w of [de, en]) {
      for (const k of ["ticketsTotal", "ticketsNoDataBody"]) assert.ok(w.admin.applications[k], k);
      assert.doesNotMatch(`${w.admin.applications.ticketsColWriteback} ${w.admin.applications.ticketsCountWriteback}`, /Rückschreiben|Write-back/i);
    }
    assert.notEqual(de.admin.applications.ticketsNoDataBody, de.admin.applications.ticketsEmptyBody, "„noch keine Tickets“ und „alle personalisiert“ sind zwei Aussagen");
  });
});
