import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { reiterZeit, sessionReiter, waehleSession, type ReiterQuelle } from "@/app/(speaker)/speaker/session/auswahl";

/**
 * SPK-085 (Konrad 05.10.: „der gesamte Session-Bereich läuft über eine Session-Auswahl — sonst doppelte Infos auf einer Seite“): hat ein Speaker zwei Sessions,
 * standen Slot, Inhalt, Präsentation und Technik zweimal untereinander — und jeder Anker zweimal im Dokument. Jetzt wählen Reiter oben die Session
 * (`?session=<Kennung>`), und darunter steht der ganze Bereich einmal, für die gewählte. Mit einer Session bleibt die Seite, wie sie war. Keine Datenbankänderung.
 * Die Regeln (`auswahl.ts`) werden hier ausgeführt, auch das Zeitformat; die Seite und die Ansicht werden am Quelltext geprüft.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const SEITE = "app/(speaker)/speaker/session/page.tsx";
const ANSICHT = "app/(speaker)/speaker/session/SessionView.tsx";

const s = (id: string, extra: Partial<ReiterQuelle> = {}): ReiterQuelle => ({ session_id: id, format: "keynote", start_at: null, timezone: null, ...extra });
const O = {
  formate: { keynote: "Keynote", panel: "Panel" },
  nummer: (n: number) => `Session ${n}`,
  dateLocale: "en-GB",
};

describe("SPK-085: welche Session die Seite zeigt", () => {
  const liste = [{ session_id: "a" }, { session_id: "b" }, { session_id: "c" }];

  it("die Kennung aus der Adresse, wenn es eine Session des Speakers ist", () => {
    assert.equal(waehleSession("b", liste), "b");
    assert.equal(waehleSession("c", liste), "c");
  });

  it("ohne Angabe, bei unbekannter Kennung und bei doppelter Angabe die erste Session (die, die zuerst stattfindet)", () => {
    assert.equal(waehleSession(undefined, liste), "a");
    assert.equal(waehleSession("", liste), "a");
    assert.equal(waehleSession("gibt-es-nicht", liste), "a");
    assert.equal(waehleSession(["b", "c"], liste), "a");
    assert.equal(waehleSession("B", liste), "a", "Groß- und Kleinschreibung zählt");
  });

  it("eine Session, die dem Speaker nicht gehört, öffnet nichts: nur Kennungen aus der eigenen Liste gelten", () => {
    assert.equal(waehleSession("00000000-0000-0000-0000-000000000000", liste), "a");
    assert.equal(waehleSession("' or 1=1 --", liste), "a");
  });

  it("ohne Sessions gibt es nichts zu wählen", () => {
    assert.equal(waehleSession("a", []), null);
    assert.equal(waehleSession(undefined, []), null);
  });

  it("mit einer Session ist es diese — auch bei einer fremden Kennung", () => {
    assert.equal(waehleSession("x", [{ session_id: "nur" }]), "nur");
  });
});

describe("SPK-085: Wochentag und Uhrzeit im Reiter — Zeitformat ausgeführt", () => {
  it("in der Zeitzone der Veranstaltung, nicht in der des Besuchers", () => {
    assert.equal(reiterZeit("2027-04-16T08:00:00Z", "Europe/Berlin", "en-GB"), "Fri 10:00");
    assert.equal(reiterZeit("2027-04-16T08:00:00Z", "America/New_York", "en-GB"), "Fri 04:00");
  });

  it("deutsch und englisch; Mitternacht als 00 statt 24, der Wochentag wechselt mit", () => {
    assert.equal(reiterZeit("2027-04-16T08:00:00Z", "Europe/Berlin", "de-DE"), "Fr., 10:00");
    assert.equal(reiterZeit("2027-04-17T12:00:00Z", "Europe/Berlin", "de-DE"), "Sa., 14:00");
    assert.equal(reiterZeit("2027-04-16T22:30:00Z", "Europe/Berlin", "de-DE"), "Sa., 00:30");
  });

  it("ein unlesbarer Zeitpunkt gibt nichts zurück (kein „Invalid Date“ im Reiter)", () => {
    assert.equal(reiterZeit("kaputt", "Europe/Berlin", "en-GB"), "");
    assert.equal(reiterZeit("", "Europe/Berlin", "en-GB"), "");
  });
});

describe("SPK-085: die Beschriftung der Reiter", () => {
  it("Format und Zeit; dasselbe Format zweimal bekommt eine Zählung: „Keynote 1“, „Keynote 2“", () => {
    const r = sessionReiter(
      [s("a", { start_at: "2027-04-16T08:00:00Z" }), s("b", { start_at: "2027-04-17T12:00:00Z" })],
      O,
    );
    assert.deepEqual(r, [
      { id: "a", label: "Keynote 1 · Fri 10:00" },
      { id: "b", label: "Keynote 2 · Sat 14:00" },
    ]);
  });

  it("verschiedene Formate brauchen keine Zählung", () => {
    const r = sessionReiter([s("a", { start_at: "2027-04-16T08:00:00Z" }), s("b", { format: "panel", start_at: "2027-04-17T12:00:00Z" })], O);
    assert.deepEqual(r.map((x) => x.label), ["Keynote · Fri 10:00", "Panel · Sat 14:00"]);
  });

  it("nur die Doppelten werden gezählt: Keynote, Panel, Keynote → „Keynote 1“, „Panel“, „Keynote 2“", () => {
    const r = sessionReiter([s("a"), s("b", { format: "panel" }), s("c")], O);
    assert.deepEqual(r.map((x) => x.label), ["Keynote 1", "Panel", "Keynote 2"]);
  });

  it("ohne Slot steht keine Zeit da", () => {
    const r = sessionReiter([s("a", { start_at: "2027-04-16T08:00:00Z" }), s("b")], O);
    assert.deepEqual(r.map((x) => x.label), ["Keynote 1 · Fri 10:00", "Keynote 2"]);
  });

  it("ohne Format steht „Session 1“, „Session 2“ — die Nummer ist die Stelle in der Liste", () => {
    const r = sessionReiter([s("a", { format: null }), s("b", { format: null })], O);
    assert.deepEqual(r.map((x) => x.label), ["Session 1", "Session 2"]);
    const gemischt = sessionReiter([s("a"), s("b", { format: null })], O);
    assert.deepEqual(gemischt.map((x) => x.label), ["Keynote", "Session 2"]);
  });

  it("ein Format, das das Vokabular nicht kennt, steht roh da statt leer", () => {
    assert.equal(sessionReiter([s("a", { format: "neu-erfunden" })], O)[0].label, "neu-erfunden");
  });

  it("die Zeitzone der Session gilt, ohne Angabe Berlin; die Reihenfolge und die Kennungen bleiben", () => {
    const r = sessionReiter(
      [s("a", { start_at: "2027-04-16T08:00:00Z", timezone: "America/New_York" }), s("b", { format: "panel", start_at: "2027-04-16T08:00:00Z", timezone: null })],
      O,
    );
    assert.deepEqual(r, [
      { id: "a", label: "Keynote · Fri 04:00" },
      { id: "b", label: "Panel · Fri 10:00" },
    ]);
  });

  it("deutsche Zeitformate im deutschen Portal", () => {
    const r = sessionReiter([s("a", { start_at: "2027-04-16T08:00:00Z" })], { ...O, dateLocale: "de-DE" });
    assert.equal(r[0].label, "Keynote · Fr., 10:00");
  });

  it("die Eingabe bleibt unverändert", () => {
    const liste = [s("a"), s("b")];
    const vorher = JSON.stringify(liste);
    sessionReiter(liste, O);
    assert.equal(JSON.stringify(liste), vorher);
  });
});

describe("SPK-085: die Seite", () => {
  const seite = quelle(SEITE);

  it("die Adresse trägt die Auswahl: `?session=`, geprüft gegen die eigene Liste", () => {
    assert.match(seite, /searchParams: Promise<\{ session\?: string \| string\[\] \}>/);
    assert.match(seite, /const \{ session: sessionParam \} = await searchParams;/);
    assert.match(seite, /const gewaehltId = waehleSession\(sessionParam, sessions\);\s*const angezeigt = sessions\.filter\(\(s\) => s\.session_id === gewaehltId\);/);
  });

  it("die Ansicht bekommt nur die gewählte Session — damit stehen Slot, Inhalt, Präsentation und Technik einmal da und jeder Anker einmal", () => {
    assert.match(seite, /sessions=\{angezeigt\}/);
    assert.doesNotMatch(seite, /sessions=\{sessions\}/);
  });

  it("die Fristen werden nur für die gezeigte Session geladen", () => {
    assert.match(seite, /\.\.\.angezeigt\.map\(\(s\) => supabase\.rpc\("presentation_window", \{ p_session_id: s\.session_id \}\)\)/);
    assert.match(seite, /angezeigt\.forEach\(\(s, i\) => \{\s*windowBySession\[s\.session_id\]/);
  });

  it("Reiter nur ab zwei Sessions, vor den Abschnitten; die Seite bleibt beim Wechsel, wo sie ist; der aktive Reiter ist der gewählte", () => {
    assert.match(seite, /\{sessions\.length > 1 && \(\s*<>\s*<p className="ct-help mb-3 max-w-text">\{t\.speaker\.sessionChooseHint\.replace\("\{n\}", String\(sessions\.length\)\)\}<\/p>\s*<SectionTabs/);
    assert.match(seite, /href: `\?session=\$\{r\.id\}`, label: r\.label, aktiv: r\.id === gewaehltId, scroll: false/);
    assert.equal((seite.match(/<SectionTabs/g) ?? []).length, 1);
    assert.ok(seite.indexOf("<SectionTabs") < seite.indexOf("<AbschnittsNavigation"), "erst die Auswahl, dann die Abschnitte");
  });

  it("die Beschriftung kommt aus dem Vokabular (`session_format`) und dem Wörterbuch, die Zeit in der Sprache des Portals", () => {
    assert.match(seite, /formate: vgroup\(vocab, "session_format"\)/);
    assert.match(seite, /nummer: \(n\) => t\.speaker\.sessionNumber\.replace\("\{n\}", String\(n\)\)/);
    assert.match(seite, /dateLocale: t\.meta\.dateLocale/);
  });

  it("die Abschnitte und der Leerzustand bleiben, wie sie waren: Anker nur mit Session, ohne Session der Leerzustand", () => {
    assert.match(seite, /\{sessions\.length > 0 && \(\s*<AbschnittsNavigation/);
    assert.match(seite, /\{sessions\.length === 0 \? \(\s*<EmptyState/);
    for (const id of ["slot", "inhalt", "praesentation", "technik"]) assert.match(seite, new RegExp(`\\{ id: "${id}", label:`));
  });

  it("die Rückfrage vor dem Verlassen kommt aus dem Wörterbuch des Portals (`common.unsaved`)", () => {
    assert.match(seite, /unsaved: t\.common\.unsaved,/);
  });
});

describe("SPK-085: die Ansicht — beim Wechsel geht nichts still verloren", () => {
  const ansicht = quelle(ANSICHT);

  it("ein Wechsel der Session lädt die Seite neu: ungesicherte Eingaben fragen nach (QS-051), der Stand „gesendet“ ist der beim Öffnen und nach dem Einreichen", () => {
    assert.match(ansicht, /import \{ useUngesichert, type UngesichertTexte \} from "@\/components\/ui\/useUngesichert";/);
    assert.match(ansicht, /const \[basis, setBasis\] = useState\(\(\) => JSON\.stringify\(draft\)\);\s*const warnung = useUngesichert\(JSON\.stringify\(draft\) !== basis, common\.unsaved\);/);
    assert.match(ansicht, /toast\("success", t\.submitDone\);\s*setBasis\(JSON\.stringify\(draft\)\);\s*onSubmitted\(\);/);
  });

  it("die Rückfrage steht einmal je Session-Karte, unter der Technik", () => {
    assert.equal((ansicht.match(/\{warnung\}/g) ?? []).length, 1);
    assert.match(ansicht, /<TechSection[\s\S]*?\/>\s*\{warnung\}\s*<\/div>/);
  });

  it("beide Prop-Typen tragen die Texte der Rückfrage", () => {
    assert.equal((ansicht.match(/unsaved: UngesichertTexte;/g) ?? []).length, 2);
  });

  it("der Upload oben gilt der einen gezeigten Session, wie bei genau einer Session bisher", () => {
    assert.match(ansicht, /const einzige = sessions\.length === 1 \? sessions\[0\] : null;/);
  });

  it("jeder Anker steht im Quelltext einmal: eine Karte je Abschnitt, gezeichnet für die eine Session", () => {
    for (const id of ["slot", "inhalt", "praesentation", "technik"]) assert.equal((ansicht.match(new RegExp(`<Card id="${id}"`, "g")) ?? []).length, 1, id);
  });
});

describe("SPK-085: Texte", () => {
  type Bereich = Record<string, string>;
  const de = (JSON.parse(quelle("lib/i18n/de.json")) as { speaker: Bereich }).speaker;
  const en = (JSON.parse(quelle("lib/i18n/en.json")) as { speaker: Bereich }).speaker;

  it("DE und EN haben die drei Schlüssel, keiner ist leer", () => {
    for (const k of ["sessionChoose", "sessionChooseHint", "sessionNumber"]) {
      assert.ok(de[k]?.trim(), `de.${k}`);
      assert.ok(en[k]?.trim(), `en.${k}`);
    }
  });

  it("die Platzhalter {n} stehen in beiden Sprachen", () => {
    for (const k of ["sessionChooseHint", "sessionNumber"]) {
      assert.match(de[k], /\{n\}/, `de.${k}`);
      assert.match(en[k], /\{n\}/, `en.${k}`);
    }
  });

  it("der Hinweis sagt, was je Session gilt", () => {
    assert.match(de.sessionChooseHint, /Titel, Beschreibung, Präsentation und Technik gelten je Session/);
    assert.match(en.sessionChooseHint, /Title, description, presentation and tech apply to each session separately/);
  });
});

describe("SPK-085: Konrads Konto sieht die Auswahl — Testdaten-Schritt `zweite-session`", () => {
  const skript = quelle("scripts/testdaten-konrad.mjs");
  const schritt = skript.slice(skript.indexOf("async function zweiteSession(me, ed)"), skript.indexOf("async function speakerTicket(me, ed)"));

  it("der Schritt ist angemeldet und im Kopf des Skripts beschrieben", () => {
    assert.match(skript, /"zweite-session": zweiteSession,/);
    assert.match(skript, /--apply --nur=zweite-session \(SPK-085:/);
  });

  it("eine zweite Session (Panel) mit Konrad als Speaker: Titel mit Präfix, im Entwurf, ohne Slot — und nur die eine Session, die er braucht", () => {
    assert.ok(schritt.length > 200, "Schritt nicht gefunden");
    assert.match(schritt, /const titel = `\$\{PREFIX\}Panel`;/);
    assert.match(schritt, /format: "panel"/);
    assert.match(schritt, /publish_status: "draft"/);
    assert.doesNotMatch(schritt, /slot_id/, "der Slot gehört dem Team");
    assert.match(schritt, /role: "speaker", confirmed: true/);
    // dasselbe Muster wie `ownSession`: dieselbe Veranstaltung
    assert.match(schritt, /const eventId = \(await summit\(ed\)\)\?\.id \?\? ed\.id;/);
  });

  it("idempotent: die Session wird über Veranstaltung und Titel gesucht und nur angelegt, wenn es sie nicht gibt; die Zuordnung ist ein Upsert", () => {
    assert.match(schritt, /\.eq\("event_id", eventId\)\.eq\("title_de", titel\)\.maybeSingle\(\)/);
    assert.match(schritt, /if \(!sessionId\) \{/);
    assert.match(schritt, /\.upsert\(\{ session_id: sessionId, person_id: me\.id, role: "speaker", confirmed: true \},\s*\{ onConflict: "session_id,person_id,role" \}\)/);
  });

  it("`--remove` räumt sie mit auf: es löscht alle Sessions mit dem Präfix im Titel", () => {
    assert.match(skript, /await admin\.from\("session"\)\.select\("id"\)\.like\("title_de", `\$\{PREFIX\}%`\)/);
    assert.match(skript, /return admin\.from\("session"\)\.delete\(\)\.like\("title_de", `\$\{PREFIX\}%`\);/);
  });

  it("das Format „panel“ gibt es im Vokabular der Session-Formate", () => {
    assert.match(migrationText("v2_seed_vocab_fls27"), /\('session_format','panel','Panel','Panel',\d+\)/);
  });
});

describe("SPK-085: Doku", () => {
  it("Testleitfaden: eine Zeile zur Session-Auswahl nennt die Reiter, ihre Beschriftung, die Adresse und die Rückfrage beim Wechsel", () => {
    const zeile = quelle("docs/team-testleitfaden.md").split("\n").find((l) => l.startsWith("| `/speaker/session` Session-Auswahl"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /SPK-085/);
    assert.match(zeile, /Keynote 1/);
    assert.match(zeile, /`\?session=/);
    assert.match(zeile, /Änderungen verwerfen/);
  });

  it("Backlog: SPK-085 trägt die PR-Nummer und nennt die Auswahl für den ganzen Bereich", () => {
    const zeile = quelle("docs/feedback/speaker.md").split("\n").find((l) => l.startsWith("| SPK-085 |"));
    assert.ok(zeile && /\| P2 \| (geplant|gebaut|abgenommen) #\d+/.test(zeile), "SPK-085 trägt keine PR-Nummer");
    assert.match(zeile, /Slot, Inhalt, Präsentation und Technik/);
  });
});
