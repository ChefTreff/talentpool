import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  amTischGeordnet,
  fragenSatz,
  offeneFragenGruppieren,
  tischStand,
  uebernahmeFehler,
  uebernommenText,
  vorgabeGespraech,
  type FrageFuerSatz,
  type OffenesGespraech,
} from "@/lib/partner/tischvorgabe";
import { fragenAufteilen, type SessionFrage } from "@/components/partner/fragen";
import { istVorschlag, migrationText } from "@/tests/migration-datei";

/**
 * PART-150 (Plan-Entscheidung 09.10.2026): Tischvorgabe mit Übernahme. Das erste Gespräch eines Tisches ist die Vorgabe — abgeleitet, nichts gespeichert —, die
 * Karte „Tischvorgabe“ bearbeitet seine Fragen, `partner_copy_table_questions` übernimmt sie auf die übrigen Gespräche, die Liste sagt je Gespräch, ob es von
 * der Vorgabe abweicht, und das Team gibt gleiche offene Fragen eines Tisches auf einmal frei. Die Regeln als Verhalten, die Verdrahtung und die Migration am
 * Quelltext (Komponenten lädt der Testlader nicht); die Datenbank belegt `supabase/tests/v6_tisch_fragen_uebernahme.sql`.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ohneKommentare = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const app = (p: string) => ohneKommentare(quelle(`app/(partner)/partner/${p}`));
const komp = (p: string) => ohneKommentare(quelle(`components/partner/${p}`));
const leer = (text: string) => text.replace(/\s+/g, " ").trim();

const gespraech = (id: string, starts_at: string | null) => ({ id, starts_at });
const frage = (x: Partial<FrageFuerSatz> & { label_de: string }): FrageFuerSatz => ({
  question_id: null,
  label_en: x.label_de,
  type: "text",
  options: null,
  purpose: "Zweck",
  ...x,
});
const WAEHLBAR = new Set(["a", "b"]);

describe("Vorgabe: das erste Gespräch des Tisches", () => {
  it("der früheste Beginn gewinnt, gleichgültig wo er in der Liste steht; bei gleichem Beginn die kleinere Id", () => {
    const liste = [gespraech("c", "2027-04-15T09:30:00Z"), gespraech("b", "2027-04-15T09:00:00Z"), gespraech("a", "2027-04-15T09:00:00Z"), gespraech("d", "2027-04-15T10:00:00Z")];
    assert.equal(vorgabeGespraech(liste)?.id, "a");
    assert.deepEqual(amTischGeordnet(liste).map((x) => x.id), ["a", "b", "c", "d"]);
  });

  it("ein Beginn in anderer Zonenschreibweise zählt als der Zeitpunkt, nicht als Text; ein fehlender oder unlesbarer Beginn kommt zuletzt", () => {
    // 09:00 in UTC+2 ist 07:00 UTC und damit **vor** 08:00 UTC, obwohl die Zeichenkette „09:00“ hinter „08:00“ sortiert.
    assert.equal(vorgabeGespraech([gespraech("x", "2027-04-15T08:00:00+00:00"), gespraech("y", "2027-04-15T09:00:00+02:00")])?.id, "y");
    assert.deepEqual(
      amTischGeordnet([gespraech("n", null), gespraech("k", "kein Datum"), gespraech("z", "2027-04-15T09:00:00Z"), gespraech("m", null)]).map((x) => x.id),
      ["z", "k", "m", "n"],
      "ohne Beginn zuletzt, untereinander nach Id",
    );
  });

  it("fällt das erste Gespräch weg (abgesagt), rückt das nächste nach; ohne Gespräch gibt es keine Vorgabe; die Eingabe bleibt unverändert", () => {
    const liste = [gespraech("b", "2027-04-15T09:30:00Z"), gespraech("a", "2027-04-15T09:00:00Z")];
    const kopie = [...liste];
    assert.equal(vorgabeGespraech(liste)?.id, "a");
    assert.deepEqual(liste, kopie, "die Liste wird nicht umsortiert");
    assert.equal(vorgabeGespraech(liste.filter((x) => x.id !== "a"))?.id, "b");
    assert.equal(vorgabeGespraech([]), undefined);
  });
});

describe("Fragensatz: was zur Vorgabe gehört und was nicht", () => {
  const katalog = (id: string) => frage({ question_id: id, label_de: `Katalog ${id}` });

  it("nur wählbare Katalogfragen zählen, in jeder Reihenfolge; Fragen des Teams (nicht wählbar) nie", () => {
    const team = frage({ question_id: "team", label_de: "Teamfrage" });
    assert.equal(fragenSatz([katalog("a"), katalog("b")], WAEHLBAR), fragenSatz([katalog("b"), katalog("a")], WAEHLBAR));
    assert.equal(fragenSatz([katalog("a"), team], WAEHLBAR), fragenSatz([katalog("a")], WAEHLBAR), "die Frage des Teams ändert den Satz nicht");
    assert.notEqual(fragenSatz([katalog("a")], WAEHLBAR), fragenSatz([katalog("a"), katalog("b")], WAEHLBAR), "eine zusätzliche wählbare Frage schon");
    assert.notEqual(fragenSatz([katalog("a")], WAEHLBAR), fragenSatz([], WAEHLBAR));
  });

  it("jedes Inhaltsfeld einer eigenen Frage zählt — Text, Text englisch, Typ, Optionen, Zweck", () => {
    const basis = frage({ label_de: "Warum wir?", label_en: "Why us?", type: "select", options: [{ key: "ja", label_de: "Ja", label_en: "Yes" }], purpose: "Auswahl" });
    const satz = fragenSatz([basis], WAEHLBAR);
    for (const abweichung of [
      { label_de: "Warum ihr?" },
      { label_en: "Why you?" },
      { type: "textarea" },
      { options: [{ key: "nein", label_de: "Nein", label_en: "No" }] },
      { purpose: "Anderer Zweck" },
    ] as const) {
      assert.notEqual(fragenSatz([{ ...basis, ...abweichung }], WAEHLBAR), satz, JSON.stringify(abweichung));
    }
    assert.equal(fragenSatz([{ ...basis }], WAEHLBAR), satz, "dieselbe Frage ergibt denselben Satz");
    assert.equal(fragenSatz([{ ...basis, options: undefined }], WAEHLBAR), fragenSatz([{ ...basis, options: null }], WAEHLBAR), "fehlende und leere Optionen sind dasselbe");
  });

  it("Reihenfolge, Pflicht und Freigabestatus ändern den Satz nicht — die Übernahme ändert sie auch nicht", () => {
    const a = frage({ label_de: "Erste" });
    const b = frage({ label_de: "Zweite", purpose: "Zweck 2" });
    const mit = (f: FrageFuerSatz, extra: object) => ({ ...f, ...extra }) as FrageFuerSatz;
    assert.equal(fragenSatz([a, b], WAEHLBAR), fragenSatz([b, a], WAEHLBAR));
    assert.equal(
      fragenSatz([mit(a, { approved_at: "2027-01-01T00:00:00Z", required: true, sort_order: 7 }), b], WAEHLBAR),
      fragenSatz([mit(a, { approved_at: null, required: false, sort_order: 1 }), b], WAEHLBAR),
    );
  });
});

describe("Aufteilung der Fragen eines Gespräches: Team, gewählt, eigene", () => {
  const sf = (x: Partial<SessionFrage> & { id: string }): SessionFrage => ({
    key: x.id,
    question_id: null,
    label_de: x.id,
    label_en: x.id,
    type: "text",
    required: false,
    sort_order: 1,
    approved_at: null,
    purpose: null,
    catalog_key: null,
    ...x,
  });

  it("Katalogfragen, die Partner nicht wählen dürfen, sind die des Teams; die wählbaren stehen als gewählt (nur die Kennungen); ohne `question_id` sind die eigenen", () => {
    const fragen = [sf({ id: "z1", question_id: "team" }), sf({ id: "z2", question_id: "a" }), sf({ id: "z3", question_id: "b" }), sf({ id: "z4" }), sf({ id: "z5" })];
    const { team, gewaehlt, eigene } = fragenAufteilen(fragen, WAEHLBAR);
    assert.deepEqual(team.map((f) => f.id), ["z1"]);
    assert.deepEqual(gewaehlt, ["a", "b"]);
    assert.deepEqual(eigene.map((f) => f.id), ["z4", "z5"]);
  });

  it("ohne wählbare Katalogfragen ist jede Katalogfrage eine des Teams; ohne Fragen ist alles leer", () => {
    assert.deepEqual(fragenAufteilen([sf({ id: "z1", question_id: "a" })], new Set()).team.map((f) => f.id), ["z1"]);
    assert.deepEqual(fragenAufteilen([], WAEHLBAR), { team: [], gewaehlt: [], eigene: [] });
  });
});

describe("Stand eines Tisches: Zeilen, Abweichung, Ziele", () => {
  const drei = [gespraech("g3", "2027-04-15T10:00:00Z"), gespraech("g1", "2027-04-15T09:00:00Z"), gespraech("g2", "2027-04-15T09:30:00Z")];
  const sAtze: Record<string, string> = { g1: "vorgabe", g2: "vorgabe", g3: "anders" };
  const satz = (g: { id: string }) => sAtze[g.id];

  it("die Zeilen stehen in der Reihenfolge am Tisch; die Vorgabe ist nie abweichend, ein Gespräch mit anderem Satz schon", () => {
    const stand = tischStand(drei, satz);
    assert.equal(stand.vorgabe?.id, "g1");
    assert.deepEqual(
      stand.zeilen.map((z) => [z.gespraech.id, z.istVorgabe, z.abweichend]),
      [["g1", true, false], ["g2", false, false], ["g3", false, true]],
    );
  });

  it("die Ziele der Übernahme sind alle Gespräche außer der Vorgabe, in der Reihenfolge am Tisch", () => {
    assert.deepEqual(tischStand(drei, satz).ziele.map((g) => g.id), ["g2", "g3"]);
    assert.deepEqual(tischStand([gespraech("einzig", "2027-04-15T09:00:00Z")], () => "x").ziele, [], "ein Gespräch hat nichts zu übernehmen");
  });

  it("fällt die Vorgabe weg, rückt das nächste Gespräch nach und die Abweichung wird neu gerechnet", () => {
    const ohneErstes = drei.filter((g) => g.id !== "g1");
    const stand = tischStand(ohneErstes, satz);
    assert.equal(stand.vorgabe?.id, "g2");
    assert.deepEqual(stand.zeilen.map((z) => [z.gespraech.id, z.abweichend]), [["g2", false], ["g3", true]]);
  });

  it("ohne Gespräch gibt es weder Vorgabe noch Zeilen noch Ziele", () => {
    assert.deepEqual(tischStand([], satz), { vorgabe: undefined, zeilen: [], ziele: [] });
  });
});

describe("Meldungen der Übernahme", () => {
  const rpc = { too_many_questions: "Mehr als zwei eigene Fragen je Format sind nicht vorgesehen.", unknown: "Etwas ist schiefgelaufen." };
  const titel = { g2: "Gespräch 14:30" };
  const vorlage = "{meldung} (Gespräch: {gespraech})";

  it("ein Fehler mit einem Gespräch dieses Tisches nennt es; ein fremdes `detail` bleibt ungenannt; ein unbekannter Schlüssel fällt auf `unknown`", () => {
    assert.equal(uebernahmeFehler({ key: "too_many_questions", detail: "g2" }, rpc, titel, vorlage), "Mehr als zwei eigene Fragen je Format sind nicht vorgesehen. (Gespräch: Gespräch 14:30)");
    assert.equal(uebernahmeFehler({ key: "too_many_questions", detail: "fremd-1234" }, rpc, titel, vorlage), rpc.too_many_questions, "keine fremde Kennung in der Meldung");
    assert.equal(uebernahmeFehler({ key: "too_many_questions" }, rpc, titel, vorlage), rpc.too_many_questions);
    assert.equal(uebernahmeFehler({ key: "gibt_es_nicht" }, rpc, titel, vorlage), rpc.unknown);
  });

  it("nach der Übernahme: 0 Gespräche heißt „hatten die Vorgabe schon“, eins und mehrere je ihr Satz", () => {
    const t = { vorgabeSame: "schon gleich", vorgabeCopiedOne: "auf ein Gespräch übernommen", vorgabeCopied: "auf {n} übernommen" };
    assert.equal(uebernommenText(0, t), "schon gleich");
    assert.equal(uebernommenText(1, t), "auf ein Gespräch übernommen");
    assert.equal(uebernommenText(19, t), "auf 19 übernommen");
  });
});

describe("Freigabe im Admin: gleiche offene Fragen eines Tisches in einer Gruppe", () => {
  const f = (id: string, label_de: string, extra: object = {}) => ({ id, label_de, label_en: null, type: "text", options: null, purpose: "Zweck", ...extra });
  const g = (sessionId: string, stageId: string | null, fragen: ReturnType<typeof f>[], titel = `Gespräch ${sessionId}`): OffenesGespraech => ({
    sessionId,
    sessionTitle: titel,
    stageId,
    stageName: stageId ? `Tisch ${stageId}` : null,
    fragen,
  });

  it("Gespräche desselben Tisches mit denselben offenen Fragen bilden eine Gruppe — in der Reihenfolge der Liste, unter dem Namen des Tisches", () => {
    const gruppen = offeneFragenGruppieren([g("s1", "t1", [f("q1", "Warum?")]), g("s2", "t1", [f("q2", "Warum?")]), g("s3", "t1", [f("q3", "Warum?")])]);
    assert.equal(gruppen.length, 1);
    assert.deepEqual(gruppen[0].sessionIds, ["s1", "s2", "s3"]);
    assert.equal(gruppen[0].titel, "Tisch t1");
  });

  it("andere offene Fragen, ein anderer Tisch oder gar kein Tisch trennen — auch bei gleichem Text", () => {
    const gleich = [f("q", "Warum?")];
    assert.equal(offeneFragenGruppieren([g("s1", "t1", gleich), g("s2", "t1", [f("q", "Wieso?")])]).length, 2, "anderer Text");
    assert.equal(offeneFragenGruppieren([g("s1", "t1", gleich), g("s2", "t1", [...gleich, f("q9", "Noch eine")])]).length, 2, "eine Frage mehr");
    assert.equal(offeneFragenGruppieren([g("s1", "t1", gleich), g("s2", "t2", gleich)]).length, 2, "anderer Tisch");
    assert.equal(offeneFragenGruppieren([g("s1", null, gleich), g("s2", null, gleich)]).length, 2, "ohne Tisch steht jedes Gespräch für sich");
    for (const abweichung of [{ label_en: "Why?" }, { type: "textarea" }, { options: [{ key: "ja" }] }, { purpose: "Anderer Zweck" }]) {
      assert.equal(offeneFragenGruppieren([g("s1", "t1", gleich), g("s2", "t1", [f("q", "Warum?", abweichung)])]).length, 2, JSON.stringify(abweichung));
    }
  });

  it("die Reihenfolge der Fragen im Gespräch zählt nicht; ein Gespräch allein trägt seinen eigenen Titel; die Gruppen stehen in der Reihenfolge ihres ersten Gesprächs", () => {
    const zwei = [f("q1", "Eins"), f("q2", "Zwei", { purpose: "Z2" })];
    const gruppen = offeneFragenGruppieren([g("s1", "t1", zwei), g("s2", "t9", [f("q3", "Allein")], "Nur dieses"), g("s3", "t1", [...zwei].reverse())]);
    assert.deepEqual(gruppen.map((x) => x.sessionIds), [["s1", "s3"], ["s2"]]);
    assert.equal(gruppen[1].titel, "Nur dieses");
  });
});

describe("Verdrahtung: Aktion, Lader, Seite", () => {
  it("die Server-Aktion ruft `partner_copy_table_questions` mit Quelle und Zielen — die Organisation kommt nie von hier", () => {
    const a = app("actions.ts");
    const stelle = a.slice(a.indexOf("export async function copyTableQuestions"));
    assert.match(stelle, /supabase\.rpc\("partner_copy_table_questions", \{\s+p_from_session: fromSessionId,\s+p_to_sessions: toSessionIds,\s+\}\)/);
    assert.doesNotMatch(stelle.slice(0, stelle.indexOf("\n}\n")), /p_org_id/);
    assert.match(stelle, /revalidatePath\(`\$\{PATH\}\/interview-tables\/fragen`\)/);
  });

  it("alle Fragen eines Tisches kommen mit einer Abfrage; `ladeFragen` bleibt als Hülle darum", () => {
    const b = app("bewerbungen.ts");
    assert.match(b, /export async function ladeFragenJe\(supabase: SupabaseClient, sessionIds: string\[\]\)/);
    assert.match(b, /\.in\("session_id", sessionIds\)/);
    assert.match(b, /\(await ladeFragenJe\(supabase, \[sessionId\]\)\)\.get\(sessionId\) \?\? \[\]/);
    // Die Optionen gehören zum Vergleich („gleich“ heißt gleich in allen Inhaltsfeldern).
    assert.match(b, /select\("session_id, id, question_id, label_de, label_en, type, options,/);
  });

  it("die Fragenseite zeigt ab zwei Gesprächen an einem Tisch die Tischvorgabe, sonst wie bisher die Karten je Gespräch", () => {
    const u = app("FormatUnterseite.tsx");
    const tisch = u.indexOf('ansicht === "fragen" && format === "interview_table" && sessions.length >= 2');
    const sonst = u.indexOf('ansicht === "fragen" ? (');
    assert.ok(tisch > 0 && sonst > tisch, "Tischvorgabe vor dem allgemeinen Fall");
    assert.match(u, /<TischFragen\s+supabase=\{supabase\}\s+sessions=\{sessions\}/);
    assert.match(u, /t=\{\{ tisch: s, bewerbung: b, rpc: t\.rpc, cancel: t\.partnerTalk\.cancel \}\}/);
    assert.match(u, /<FormatFragen\s+supabase=\{supabase\}/);
  });

  it("die Seite des Tisches: eine Abfrage, Vorgabe und Ziele aus `tischStand`, das erste Gespräch als Träger, die Vorgabe selbst ohne Zeilenaktion", () => {
    const s = app("TischFragen.tsx");
    assert.match(s, /await ladeFragenJe\(supabase, sessions\.map\(\(x\) => x\.id\)\)/);
    assert.doesNotMatch(s, /\bladeFragen\(/, "keine Abfrage je Gespräch");
    assert.match(s, /tischStand\(sessions, \(x\) => fragenSatz\(fragenVon\(x\), waehlbarIds\)\)/);
    assert.equal((s.match(/carrierId=\{vorgabe\.id\}/g) ?? []).length, 2, "die Karte und die Zeilenaktion nehmen dieselbe Vorgabe");
    assert.match(s, /zielIds=\{ziele\.map\(\(x\) => x\.id\)\}/);
    assert.match(s, /anzahl=\{sessions\.length\}/);
    // Die Vorgabe wird in der Karte bearbeitet; ihre Zeile trägt nur die Marke.
    assert.match(s, /\{!istVorgabe && \(\s*<div className="flex flex-wrap items-center gap-2">\s*<GespraechFragen/);
    // „Tischvorgabe übernehmen“ nur bei Recht **und** Abweichung.
    assert.match(s, /\{canEdit && abweichend && \(\s*<TischUebernehmen/);
    assert.match(s, /<Badge tone=\{istVorgabe \? "accent" : abweichend \? "warning" : "success"\}>/);
  });

  it("Hauptknopf: erst die Katalogwahl der Vorgabe speichern (nur bei Änderung), dann übernehmen; „Nur die Vorgabe speichern“ übernimmt nichts", () => {
    const k = komp("TischVorgabe.tsx");
    const speichern = k.slice(k.indexOf("function speichern("), k.indexOf("return (", k.indexOf("function speichern(")));
    const erst = speichern.indexOf("setSessionQuestions(carrierId, auswahl)");
    const dann = speichern.indexOf("copyTableQuestions(carrierId, zielIds)");
    assert.ok(erst > 0 && dann > erst, "erst speichern, dann übernehmen");
    assert.match(speichern, /if \(geaendert\) \{\s+const res = await setSessionQuestions/);
    assert.match(speichern, /if \(mitUebernahme\) \{\s+const res = await copyTableQuestions/);
    // Der Hauptknopf trägt keine Variante (primär); der zweite ist `secondary` und nur bei einer Änderung bedienbar.
    assert.match(k, /<Button loading=\{pending && aktion === "alle"\} disabled=\{pending && aktion !== "alle"\} onClick=\{\(\) => speichern\(true\)\}>\s*(?:\{\}\s*)?<span className="sm:hidden">\{t\.vorgabeSaveAllShort\}<\/span>\s*<span className="max-sm:hidden">\{t\.vorgabeSaveAll\.replace\("\{n\}", String\(anzahl\)\)\}<\/span>\s*<\/Button>/);
    assert.match(k, /variant="secondary"\s+loading=\{pending && aktion === "nur"\}\s+disabled=\{!geaendert \|\| \(pending && aktion !== "nur"\)\}\s+onClick=\{\(\) => speichern\(false\)\}/);
    // Ein Fehler steht neben den Knöpfen und nennt das Gespräch.
    assert.equal((k.match(/setFehler\(uebernahmeFehler\(res, rpcMessages, titelJe, t\.vorgabeErrorAt\)\)/g) ?? []).length, 2, "beim Speichern wie beim Übernehmen");
    assert.match(k, /setAktion\(null\);\s+router\.refresh\(\);/, "nach Erfolg lädt die Seite neu");
    assert.match(k, /<p role="alert" className="ct-small text-error-ink">/);
  });

  it("Schubfach und Zeilenaktion: der Inhalt hängt erst ein, wenn das Schubfach offen ist; „übernehmen“ hat genau ein Ziel und zeigt Fehler unter der Zeile", () => {
    const g = komp("GespraechFragen.tsx");
    assert.match(g, /\{offen && \(\s*<div className="flex flex-col gap-6">\s*<p className="ct-help">\{hinweis\}<\/p>\s*\{children\}/);
    assert.match(g, /aria-label=\{`\$\{label\}: \$\{titel\}`\}/);
    const u = komp("TischUebernehmen.tsx");
    assert.match(u, /copyTableQuestions\(carrierId, \[zielId\]\)/);
    assert.match(u, /<p role="alert" className="ct-small basis-full text-error-ink">/);
    assert.doesNotMatch(u, /toast\("error"/, "ein Fehler steht neben dem Knopf, nicht im Toast");
    assert.match(u, /aria-label=\{`\$\{label\}: \$\{titel\}`\}/);
  });

  it("die Katalogkästchen sind einmal gebaut: `FragenAuswahl` und die Tischvorgabe zeichnen dieselbe `FragenKaesten`", () => {
    const a = komp("FragenAuswahl.tsx");
    assert.match(a, /export function FragenKaesten\(/);
    assert.match(a, /<FragenKaesten waehlbar=\{waehlbar\} auswahl=\{auswahl\} canEdit=\{canEdit\} onUmschalten=\{umschalten\} \/>/);
    assert.match(komp("TischVorgabe.tsx"), /<FragenKaesten waehlbar=\{waehlbar\} auswahl=\{auswahl\} canEdit=\{canEdit\} onUmschalten=\{umschalten\} \/>/);
    assert.equal((a.match(/type="checkbox"/g) ?? []).length, 1, "ein Kästchen-Baustein");
  });

  it("die drei Abschnitte stehen einmal in `FragenAbschnitte` und werden von `FormatFragen` je Gespräch benutzt", () => {
    const abschnitte = app("FragenAbschnitte.tsx");
    for (const name of ["TeamFragen", "KatalogFragen", "EigeneFragen", "FragenAbschnitte"]) assert.match(abschnitte, new RegExp(`export function ${name}\\(`), name);
    const f = app("FormatFragen.tsx");
    assert.match(f, /<FragenAbschnitte\s+sessionId=\{x\.id\}\s+fragen=\{fragenJe\.get\(x\.id\) \?\? \[\]\}/);
    assert.match(f, /await ladeFragenJe\(supabase, sessions\.map\(\(x\) => x\.id\)\)/);
    assert.doesNotMatch(f, /<FragenAuswahl|<EigeneFrageAntrag/, "die Abschnitte stehen nicht mehr doppelt");
  });

  it("Admin: die Freigabe bündelt nach Tisch und gibt Gespräch für Gespräch frei, bei einem Fehler hält sie an; nur Interview Tables tragen den Tisch", () => {
    const f = ohneKommentare(quelle("app/(admin)/admin/partner/[org]/FragenFreigabe.tsx"));
    assert.match(f, /const gruppen = offeneFragenGruppieren\(offen\);/);
    assert.match(f, /for \(const id of sessionIds\) \{\s+const res = await adminApproveSessionQuestions\(id\);\s+if \(!res\.ok\) \{/);
    assert.match(f, /setAktiv\(null\);\s+if \(fertig > 0\) router\.refresh\(\);\s+return;/);
    assert.match(f, /g\.sessionIds\.length > 1 \? t\.questionsApproveAll\.replace\("\{n\}", String\(g\.sessionIds\.length\)\) : t\.questionsApprove/);
    const seite = ohneKommentare(quelle("app/(admin)/admin/partner/[org]/page.tsx"));
    assert.match(seite, /stageId: x\.format === "interview_table" \? x\.stage_id : null,/);
    assert.match(seite, /\.select\("id, session_id, label_de, label_en, type, options, purpose"\)/);
  });
});

describe("Migration `v6_tisch_fragen_uebernahme`", () => {
  const sql = () => migrationText("v6_tisch_fragen_uebernahme");
  const code = (text: string) => text.replace(/--[^\n]*/g, "");
  const funktion = (text: string) => {
    const von = text.indexOf("create or replace function partner_copy_table_questions(");
    assert.ok(von >= 0, "Funktion fehlt");
    return text.slice(von, text.indexOf("end $$;", von));
  };

  it("eine neue Funktion mit zwei Parametern, keine Tabelle, keine Spalte, kein Trigger; am Ende die Härtung", () => {
    const c = code(sql());
    assert.deepEqual([...c.matchAll(/create or replace function (\w+)\(([^)]*)\)/g)].map((m) => [m[1], m[2].trim()]), [["partner_copy_table_questions", "p_from_session uuid, p_to_sessions uuid[]"]]);
    assert.doesNotMatch(c, /\b(create|alter|drop) table\b|\badd column\b|\bcreate (trigger|index|policy)\b/i);
    assert.match(c.trimEnd(), /select harden_definer_functions\(\);$/);
    assert.match(c, /RETURNS integer\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path TO 'public', 'extensions'/);
    assert.ok(c.indexOf("set search_path = public, extensions;") < c.indexOf("create or replace function"), "search_path vor der Funktion");
  });

  it("Rechteprüfung zuerst und NULL-sicher; die Organisation kommt nur aus der Quelle, nie aus einem Parameter", () => {
    const f = code(funktion(sql()));
    const angemeldet = f.indexOf("if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'");
    const quelle_ = f.indexOf("select * into v_src from session where id = p_from_session;");
    const recht = f.indexOf("not coalesce(partner_can_edit(v_src.partner_org_id), false)");
    const tisch = f.indexOf("not_same_table");
    assert.ok(angemeldet >= 0 && angemeldet < quelle_ && quelle_ < recht && recht < tisch, "Anmeldung, Quelle, Recht, erst dann der Tisch");
    assert.match(f, /if v_src\.partner_org_id is null or not coalesce\(partner_can_edit\(v_src\.partner_org_id\), false\) then\s+raise exception 'not allowed' using errcode = '42501';/);
    assert.doesNotMatch(f, /p_org|p_edition/, "keine Organisation als Parameter");
  });

  it("jedes Ziel und die Quelle: gleiche Organisation, gleicher Tisch (nicht null), Interview Table, nicht abgesagt; Ziel ≠ Quelle; 1 bis 200 Ziele; alles unter Sperre", () => {
    const f = leer(code(funktion(sql())));
    assert.match(f, /if v_stage is null or v_src\.format <> 'interview_table' or v_src\.publish_status = 'cancelled' then raise exception 'not_same_table' using errcode = 'P0001', detail = p_from_session::text;/);
    assert.match(f, /if p_from_session = any\(v_targets\) then raise exception 'not_same_table'/);
    assert.match(f, /if cardinality\(v_targets\) = 0 then raise exception 'no_targets' using errcode = '22023'/);
    assert.match(f, /if cardinality\(v_targets\) > 200 then raise exception 'too_many_targets' using errcode = '22023'/);
    assert.match(
      f,
      /if v_t\.partner_org_id is distinct from v_src\.partner_org_id or v_t\.stage_id is distinct from v_stage or v_t\.format <> 'interview_table' or v_t\.publish_status = 'cancelled' then raise exception 'not_same_table' using errcode = 'P0001', detail = v_t\.id::text;/,
    );
    assert.match(f, /where se\.id = any\(v_targets\) order by se\.id for update of se loop/);
    assert.match(f, /if v_found <> cardinality\(v_targets\) then raise exception 'session_not_found' using errcode = 'P0002'/);
  });

  it("Katalogwahl nach den Regeln von `partner_set_session_questions`: nur wählbare Fragen anfassen, nur wählbare und aktive übernehmen, vorhandene behalten Pflicht und Platz", () => {
    const f = leer(code(funktion(sql())));
    assert.match(f, /where sq\.session_id = p_from_session and qc\.partner_selectable and qc\.active;/);
    assert.match(f, /delete from session_question sq using question_catalog qc where sq\.session_id = v_id and sq\.question_id = qc\.id and qc\.partner_selectable and not \(sq\.question_id = any\(v_cat\)\);/);
    assert.match(f, /select coalesce\(max\(sq\.sort_order\), 0\) into v_basis from session_question sq where sq\.session_id = v_id and sq\.question_id is not null;/);
    assert.match(f, /insert into session_question \(session_id, question_id, sort_order\) values \(v_id, v_q, v_basis \+ v_i\);/);
    assert.equal((f.match(/delete from/g) ?? []).length, 1, "genau ein Löschen — und nur von wählbaren Katalogfragen");
  });

  it("solange die Migration Vorschlag ist, sind die drei Anweisungen der Katalogwahl dieselben wie in `partner_set_session_questions` (Snapshot) — sonst weicht die Übernahme von der Einzelwahl ab", (t) => {
    // db-konventionen, Nachtrag 09.10.2026: nach dem Anwenden ist der Snapshot maßgeblich und wandert mit späteren Migrationen derselben Funktion weiter.
    if (!istVorschlag("v6_tisch_fragen_uebernahme")) {
      t.skip("angewendet: der Snapshot ist maßgeblich");
      return;
    }
    const alt = leer(code(quelle("supabase/snapshot/functions/partner_set_session_questions.sql")));
    const neu = leer(code(funktion(sql())));
    const anBedarf = (s: string) =>
      s
        .replaceAll("p_session_id", "v_id")
        .replaceAll("coalesce(p_question_ids, '{}'::uuid[])", "v_cat")
        .replaceAll("values (v_id, q, v_basis + i)", "values (v_id, v_q, v_basis + v_i)");
    for (const anweisung of [
      "delete from session_question sq using question_catalog qc where sq.session_id = p_session_id and sq.question_id = qc.id and qc.partner_selectable and not (sq.question_id = any(coalesce(p_question_ids, '{}'::uuid[])));",
      "select coalesce(max(sq.sort_order), 0) into v_basis from session_question sq where sq.session_id = p_session_id and sq.question_id is not null;",
      "insert into session_question (session_id, question_id, sort_order) values (p_session_id, q, v_basis + i);",
    ]) {
      assert.ok(alt.includes(anweisung), `Snapshot: ${anweisung.slice(0, 60)}… fehlt`);
      assert.ok(neu.includes(anBedarf(anweisung)), `Migration: ${anBedarf(anweisung).slice(0, 60)}… weicht ab`);
    }
  });

  it("eigene Fragen: nur hinzufügen, wenn keine in allen Inhaltsfeldern gleiche da ist; Freigabe nur mitnehmen oder nachziehen, wenn die Quelle freigegeben ist; Grenze vorab geprüft", () => {
    const f = leer(code(funktion(sql())));
    assert.match(f, /where sq\.session_id = p_from_session and sq\.question_id is null and sq\.requested_by is not null order by sq\.sort_order, sq\.created_at, sq\.id loop/);
    for (const feld of ["label_de", "label_en", "type", "options", "purpose"]) assert.match(f, new RegExp(`and sq\\.${feld} is not distinct from v_r\\.${feld}`), feld);
    assert.match(f, /where sq\.session_id = v_id and sq\.question_id is null and sq\.requested_by is not null and sq\.label_de/);
    assert.match(f, /select count\(\*\)::integer into v_n from session_question sq where sq\.session_id = v_id and sq\.question_id is null; if v_n >= 2 then raise exception 'too_many_questions' using errcode = 'P0001', detail = v_id::text;/);
    assert.match(f, /current_person_id\(\), v_r\.purpose, v_r\.approved_by, v_r\.approved_at\);/);
    assert.match(f, /elsif v_ex_appr is null and v_r\.approved_at is not null then update session_question set approved_by = v_r\.approved_by, approved_at = v_r\.approved_at where id = v_ex_id;/);
    assert.doesNotMatch(f, /\bapplication\b/i, "Bewerbungen und Antworten bleiben unberührt");
  });

  it("Audit: eine Zeile je Aufruf mit genau fünf Schlüsseln, ohne Texte und Personen", () => {
    const f = code(funktion(sql()));
    assert.equal((f.match(/perform log_audit\(/g) ?? []).length, 1);
    const aufruf = leer(f.match(/perform log_audit\(([\s\S]*?)\);\s+return v_changed;/)![1]);
    assert.equal(aufruf, "'partner.table_questions', 'stage', v_stage::text, null, jsonb_build_object('from_session', p_from_session, 'sessions', v_changed, 'catalog', cardinality(v_cat), 'own', v_own_n, 'own_approved', v_own_appr)");
    assert.match(leer(f), /return v_changed;$/);
  });
});

describe("Texte und Fehlerschlüssel", () => {
  const benutzt = (text: string, praefix: string) => [...new Set([...text.matchAll(new RegExp(`\\b${praefix}\\.([a-zA-Z_]+)`, "g"))].map((m) => m[1]))];

  it("alle benutzten Texte stehen in beiden Wörterbüchern, mit ihren Platzhaltern; deutsch in der Ihr-Ansprache", () => {
    const tisch = [
      ...benutzt(app("TischFragen.tsx"), "v"),
      ...benutzt(komp("TischVorgabe.tsx"), "t"),
      "rowChangeHint", "rowClose", "rowView", "rowAdopt", "rowAdopted", "vorgabeErrorAt", "vorgabeSame", "vorgabeCopiedOne",
    ];
    const bewerbung = [...benutzt(app("TischFragen.tsx"), "s"), ...benutzt(app("FragenAbschnitte.tsx"), "s"), ...benutzt(komp("TischVorgabe.tsx"), "s")];
    const admin = benutzt(ohneKommentare(quelle("app/(admin)/admin/partner/[org]/FragenFreigabe.tsx")), "t");
    for (const sprache of ["de", "en"] as const) {
      const d = JSON.parse(quelle(`lib/i18n/${sprache}.json`)) as Record<string, Record<string, string>>;
      for (const k of new Set(tisch)) assert.equal(typeof d.partnerInterviewTables[k], "string", `${sprache}: partnerInterviewTables.${k}`);
      for (const k of new Set(bewerbung)) assert.equal(typeof d.partnerBewerbung[k], "string", `${sprache}: partnerBewerbung.${k}`);
      for (const k of new Set(admin)) assert.equal(typeof d.adminPartner[k], "string", `${sprache}: adminPartner.${k}`);
      assert.equal(typeof d.rpc.not_same_table, "string", `${sprache}: rpc.not_same_table`);
      const v = d.partnerInterviewTables;
      for (const [k, platz] of [["vorgabeLead", ["{n}", "{gespraech}"]], ["vorgabeSaveAll", ["{n}"]], ["vorgabeCopied", ["{n}"]], ["vorgabeErrorAt", ["{meldung}", "{gespraech}"]]] as const) {
        for (const p of platz) assert.ok(v[k].includes(p), `${sprache}: ${k} trägt ${p}`);
      }
      const a = d.adminPartner;
      for (const [k, platz] of [["questionsApproveAll", ["{n}"]], ["questionsApprovedAll", ["{n}"]], ["questionsApprovePartly", ["{done}", "{n}", "{meldung}"]], ["questionsGroupTitle", ["{tisch}", "{n}"]]] as const) {
        for (const p of platz) assert.ok(a[k].includes(p), `${sprache}: ${k} trägt ${p}`);
      }
    }
    const de = JSON.parse(quelle("lib/i18n/de.json")).partnerInterviewTables as Record<string, string>;
    for (const k of ["vorgabeTitle", "vorgabeLead", "vorgabeSaveAll", "vorgabeSaveOnly", "listLead", "rowChangeHint"]) {
      assert.ok(!/\bSie\b|\bIhre[mnrs]?\b/.test(de[k]), `de: ${k} ohne Sie-Ansprache`);
    }
    assert.match(de.vorgabeLead, /\bIhr\b/);
  });

  it("`not_same_table` ist ein Geschäftsschlüssel von P0001 — sonst käme „unknown“ an", () => {
    // Im Set, nicht „als letzter Eintrag“: wer einen Schlüssel anhängt, soll diesen Test nicht brechen.
    const menge = /const BUSINESS_KEYS = new Set\(\[([\s\S]*?)\n\]\);/.exec(quelle("lib/rpc-error.ts"));
    assert.ok(menge, "BUSINESS_KEYS nicht gefunden");
    assert.match(menge[1], /\n\s*"not_same_table",/);
    assert.match(quelle("lib/rpc-error.ts"), /\/\/ Tischvorgabe der Bewerbungsfragen \(Vorschlag v6_tisch_fragen_uebernahme, PART-150\)/);
  });
});

describe("Testdaten: Konrads Konto sieht die Tischvorgabe", () => {
  it("der Schritt `tischvorgabe` legt am ersten TEST-Tisch zwei Gespräche an und gibt die Frage der Vorgabe und dem zweiten Gespräch, nicht dem dritten", () => {
    const skript = quelle("scripts/testdaten-konrad.mjs");
    assert.match(skript, /tischvorgabe: tischVorgabeSchritt,/);
    assert.match(skript, /--nur=tischvorgabe\s+\(PART-150:/);
    const schritt = skript.slice(skript.indexOf("const TISCH_FRAGE"), skript.indexOf("async function tischVorgabeSchritt") + 4500);
    assert.match(schritt, /\{ titel: `\$\{PREFIX\}Interview Table · Gespräch 2`, zeit: \["14:30", "15:00"\], mitFrage: true \}/);
    assert.match(schritt, /\{ titel: `\$\{PREFIX\}Interview Table · Gespräch 3`, zeit: \["15:00", "15:30"\], mitFrage: false \}/);
    // Dieselbe Fläche wie das erste Gespräch (Schritt `formate`), und die Vorgabe selbst bekommt die Frage.
    assert.match(schritt, /TEST_FORMATE\.find\(\(f\) => f\.schluessel === "interview_table"\)/);
    assert.match(schritt, /stage_id: buehne\.id/);
    assert.match(schritt, /await fragenAn\(erste\.id, basis\.session\.title_de\);/);
    assert.match(schritt, /if \(g\.mitFrage\) await fragenAn\(se\.id, g\.titel\);/);
    // Freigegeben und mit Zweck (wie eine vom Team freigegebene Partnerfrage); `--remove` nimmt alles über das TEST-Präfix der Titel mit.
    assert.match(schritt, /approved_by: me\.id, approved_at: new Date\(\)\.toISOString\(\)/);
    assert.match(schritt, /purpose: "Testfrage für die Tischvorgabe", requested_by: me\.id/);
    assert.match(skript, /admin\.from\("session"\)\.delete\(\)\.like\("title_de", `\$\{PREFIX\}%`\)/);
    assert.match(schritt, /if \(vorhanden\) return note\(`Frage an \$\{name\}`, "steht schon"\);/, "ein zweiter Lauf legt nichts doppelt an");
  });
});
