import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * PART-136 (Konrad 08.10.2026, K-73): auf der Talk-Seite ist der Session-Titel die Überschrift, „Wer spricht“ die
 * Überschrift darunter, die Namen sind Zeilen — und was für alle gilt, steht einmal. Das Formular zum Bearbeiten steht
 * im Schubfach, nicht aufgeklappt in der Liste. Es gibt keinen DOM-Testlauf im Repo: Maße und Bild stehen in der
 * PR-Beschreibung, hier der Quelltext.
 */

const src = (p: string) => readFileSync(p, "utf8");
const ohneKommentare = (quelle: string) => quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const wb = (sprache: "de" | "en") => JSON.parse(src(`lib/i18n/${sprache}.json`)).partnerTalk as Record<string, string>;
const groesse = (rolle: string) => {
  const m = new RegExp(`\\.${rolle} \\{[^}]*?font-size:\\s*(\\d+)px`).exec(src("app/globals.css"));
  assert.ok(m, `${rolle} in globals.css`);
  return Number(m[1]);
};

const seite = ohneKommentare(src("app/(partner)/partner/talk/page.tsx"));
const tabelle = ohneKommentare(src("app/(partner)/partner/talk/SpeakerTabelle.tsx"));

describe("PART-136: Talk — Hierarchie", () => {
  it("der Session-Titel ist die Überschrift der Karte (`CardHeader`, `h2`) mit den Marken rechts — nicht mehr ein `h2` in `ct-h3`", () => {
    assert.match(seite, /<CardHeader\s+ebene="h2"\s+title=\{titel\(x\)\}\s+action=\{/);
    assert.doesNotMatch(seite, /<h2 className="ct-h3/);
    assert.match(seite, /import \{ Card, CardHeader \} from "@\/components\/ui\/Card";/);
  });

  it("„Wer spricht“ ist `h3` in `ct-h3` mit der Zahl; ohne Speaker steht der Titel ohne „(0)“", () => {
    assert.match(seite, /<h3 className="ct-h3 text-ink">\s*\{dazu\.length > 0 \? `\$\{s\.speakersLabel\} \(\$\{dazu\.length\}\)` : s\.speakersLabel\}\s*<\/h3>/);
    assert.doesNotMatch(seite, /<p className="ct-label text-ink">\{s\.speakersLabel\}<\/p>/);
  });

  it("jede Stufe ist kleiner als die über ihr: Session-Titel (h2) > „Wer spricht“ (h3) > Name > Zweitzeile — aus `globals.css` gelesen", () => {
    const [h2, h3, label, help] = [groesse("ct-h2"), groesse("ct-h3"), groesse("ct-label"), groesse("ct-help")];
    assert.ok(h2 > h3 && h3 > label && label > help, `${h2} > ${h3} > ${label} > ${help}`);
    // Der Name und die Zweitzeile tragen genau diese zwei Rollen, nichts Größeres.
    assert.match(tabelle, /<span className="ct-label text-ink">\{sp\.display_name \|\| t\.unnamed\}<\/span>/);
    assert.match(tabelle, /<span className="ct-help mt-0\.5 block">\{zweitzeile\}<\/span>/);
    assert.doesNotMatch(tabelle, /ct-h[123]/);
  });

  it("Termin und Bühne stehen in einer Zeile (Beschriftung und Wert nebeneinander), nicht in zwei Spalten übereinander", () => {
    assert.match(seite, /<dl className="ct-small flex flex-wrap gap-x-8 gap-y-1">/);
    assert.doesNotMatch(seite, /sm:grid-cols-2/);
    assert.equal((seite.match(/<div className="flex gap-2">/g) ?? []).length, 2);
  });
});

describe("PART-136: Talk — Speaker als Tabelle, Bearbeiten im Schubfach", () => {
  it("die Seite benutzt die Tabelle und nicht mehr die Karte je Person — seit PART-149 (09.10.2026) auch die Masterclass-Seite; die Karte ist weg", () => {
    assert.match(seite, /<SpeakerTabelle\s+speakers=\{dazu\}\s+canEdit=\{canEdit\}/);
    assert.doesNotMatch(seite, /SpeakerKarte/);
    assert.match(src("app/(partner)/partner/masterclass/Instanz.tsx"), /<SpeakerTabelle speakers=\{speakers\} canEdit=\{canEdit\}/);
    assert.equal(existsSync("app/(partner)/partner/talk/SpeakerKarte.tsx"), false, "die Karte je Person gibt es nicht mehr");
    assert.doesNotMatch(src("app/(partner)/partner/masterclass/Instanz.tsx"), /SpeakerKarte/);
  });

  it("`Table stapeln` mit drei Spalten (Person, Stand, Aktion); eine Zeile je Person, der Knopf nur mit Recht", () => {
    assert.match(tabelle, /<Table stapeln>/);
    assert.equal((tabelle.match(/<Th\b/g) ?? []).length, 3);
    // Gestapelt trägt der Stand seine Beschriftung (Wächter in `tests/table-stapeln.test.ts`); Name und Aktion brauchen keine.
    assert.equal((tabelle.match(/<Td label=\{t\.colStatus\}>/g) ?? []).length, 1);
    assert.match(tabelle, /<Th aria-label=\{t\.colAction\} \/>/);
    assert.match(tabelle, /const darfPflegen = canEdit && sp\.can_edit;/);
    // Der Knopf trägt den Bezug zur Zeile (Skill-Regel 13, PART-149): „Angaben pflegen: Anna Beispiel“ — jede Zeile hat denselben Knopf.
    assert.match(
      tabelle,
      /\{darfPflegen && \(\s*<Button\s+size="sm"\s+variant="secondary"\s+aria-label=\{`\$\{t\.edit\}: \$\{sp\.display_name \|\| t\.unnamed\}`\}\s+onClick=\{\(\) => setOffen\(sp\.profile_id\)\}\s*>/,
    );
    // Position und Unternehmen kennt die RPC nur, solange der Partner pflegen darf — sonst keine Zweitzeile.
    assert.match(tabelle, /const zweitzeile = sp\.can_edit\s*\? \[sp\.job_title, sp\.organization_name\]\.filter\(Boolean\)\.join\(" · "\) \|\| t\.noRoleYet\s*: null;/);
  });

  it("Stand in Wort und Marke: Bestätigt, dazu Verwaltet oder „Pflegt selbst“ — wie vorher", () => {
    assert.match(tabelle, /\{sp\.confirmed && <Badge tone="success">\{t\.confirmed\}<\/Badge>\}/);
    assert.match(tabelle, /<Badge tone="accent">\{t\.managedBadge\}<\/Badge>/);
    assert.match(tabelle, /!sp\.can_edit && <Badge tone="neutral">\{t\.ownsData\}<\/Badge>/);
  });

  it("Bearbeiten im Schubfach: `Drawer` mit Fehlerzeile, Titel mit dem Namen, Speichern und Abbrechen im Fuß", () => {
    assert.match(tabelle, /<Drawer\s+open\s+onClose=\{onClose\}\s+title=\{t\.editTitle\.replace\("\{name\}", speaker\.display_name \|\| t\.unnamed\)\}\s+error=\{fehler\}/);
    assert.match(tabelle, /footer=\{/);
    assert.match(tabelle, /setFehler\(rpcMessages\[res\.key\] \?\? rpcMessages\.unknown \?\? res\.key\);/);
    // Fehler stehen im Schubfach, nicht im Toast hinter dem Dialog; Erfolg darf ein Toast sein.
    assert.doesNotMatch(tabelle, /toast\("error"/);
    assert.match(tabelle, /toast\("success", t\.saved\)/);
    assert.match(tabelle, /key=\{aktiv\.profile_id\}/);
  });

  it("dieselben acht Felder wie in der Liste — und derselbe Aufruf zum Speichern", () => {
    const felder = ["first_name", "last_name", "title", "job_title", "organization_name", "bio_short_de", "bio_short_en", "linkedin_url"];
    for (const f of felder) assert.match(tabelle, new RegExp(`${f}: speaker\\.${f} \\?\\? ""`), f);
    assert.equal((tabelle.match(/<Field\b/g) ?? []).length, 8);
    assert.match(tabelle, /updateTalkSpeaker\(\{\s*profileId: speaker\.profile_id,/);
    assert.match(tabelle, /v\.trim\(\) === "" \? null : v\.trim\(\)/);
  });

  it("was für alle gilt, steht einmal unter der Tabelle — nicht bei jedem Namen", () => {
    for (const alt of ["managedNote", "ownsDataBody", "managedOwnsBody"]) assert.doesNotMatch(tabelle, new RegExp(`t\\.${alt}`), alt);
    // Die Regel steht seit PART-149 einmal in `lib/partner/speaker-notiz.ts` — Talk und Masterclass sagen denselben Satz.
    const regel = ohneKommentare(src("lib/partner/speaker-notiz.ts"));
    assert.match(regel, /const kontakt = speakers\.find\(\(sp\) => sp\.mail_contact_name\)\?\.mail_contact_name \?\? null;/);
    assert.match(regel, /const pflegtSelbst = speakers\.some\(\(sp\) => !sp\.can_edit && !sp\.mail_contact_name\);/);
    assert.match(regel, /t\.speakersNoteOwn/);
    assert.match(regel, /t\.speakersNoteManaged\.replace\(\/\\\{kontakt\\\}\/g, kontakt\)/);
    assert.match(seite, /const notiz = speakerNotiz\(dazu, s\);/);
    // Der Satz steht hinter der Tabelle, in derselben Spalte.
    assert.match(seite, /<SpeakerTabelle[\s\S]*?\/>\s*\{notiz && <p className="ct-help">\{notiz\}<\/p>\}/);
  });

  it("„Speaker eintragen“ steht in der Kopfzeile des Blocks, rechts neben „Wer spricht“ — im Leerzustand dort, wo noch niemand steht; nie unter der Tabelle (PART-149)", () => {
    // Kopfzeile: derselbe Streifen wie die Überschrift, der Knopf nur mit Recht und erst, wenn es eine Liste gibt.
    assert.match(
      seite,
      /<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">\s*<h3 className="ct-h3 text-ink">[\s\S]*?<\/h3>\s*\{canEdit && dazu\.length > 0 && \(\s*<SpeakerHinzufuegen\s+sessionId=\{x\.id\}/,
    );
    // Leerzustand: ein Satz und genau diese eine Aktion.
    assert.match(
      seite,
      /<div className="flex flex-col items-start gap-3">\s*<p className="ct-help">\{s\.noSpeakerYet\}<\/p>\s*\{canEdit && \(\s*<SpeakerHinzufuegen\s+sessionId=\{x\.id\}/,
    );
    // Genau zwei Stellen, und keine hinter der Tabelle.
    assert.equal((seite.match(/<SpeakerHinzufuegen/g) ?? []).length, 2);
    const nachTabelle = seite.slice(seite.indexOf("<SpeakerTabelle"), seite.indexOf("{notiz &&"));
    assert.doesNotMatch(nachTabelle, /SpeakerHinzufuegen/);
  });

  it("Eintragen, leerer Zustand und Programmhinweis bleiben", () => {
    assert.match(seite, /\{canEdit && \(\s*<SpeakerHinzufuegen\s+sessionId=\{x\.id\}/);
    assert.match(seite, /<p className="ct-help">\{s\.noSpeakerYet\}<\/p>/);
    assert.match(seite, /<p className="ct-help">\{s\.programmeHint\}<\/p>/);
  });
});

describe("PART-136: Texte", () => {
  it("alle benutzten Schlüssel stehen in DE und EN; die Sätze nennen die Marken beim Namen", () => {
    const benutzt = (text: string, praefix: string) =>
      [...new Set([...text.matchAll(new RegExp(`\\b${praefix}\\.([a-zA-Z]+)`, "g"))].map((m) => m[1]))];
    const keys = [...benutzt(seite, "s"), ...benutzt(tabelle, "t"), ...benutzt(src("lib/partner/speaker-notiz.ts"), "t")];
    for (const k of ["colPerson", "colStatus", "colAction", "editTitle", "speakersNoteOwn", "speakersNoteManaged"]) assert.ok(keys.includes(k), `benutzt: ${k}`);
    for (const sprache of ["de", "en"] as const) {
      const t = wb(sprache);
      for (const k of keys) assert.equal(typeof t[k], "string", `${sprache}: partnerTalk.${k}`);
      assert.match(t.editTitle, /\{name\}/, sprache);
      assert.match(t.speakersNoteManaged, /\{kontakt\}/, sprache);
    }
    assert.match(wb("de").speakersNoteOwn, new RegExp(`„${wb("de").ownsData}“`));
    assert.match(wb("de").speakersNoteManaged, new RegExp(`„${wb("de").managedBadge}“`));
    assert.match(wb("en").speakersNoteOwn, new RegExp(`“${wb("en").ownsData}”`));
    assert.match(wb("en").speakersNoteManaged, new RegExp(`“${wb("en").managedBadge}”`));
  });
});
