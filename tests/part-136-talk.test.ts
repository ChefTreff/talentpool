import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
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
  it("die Seite benutzt die Tabelle und nicht mehr die Karte je Person; die Karte bleibt für die Masterclass", () => {
    assert.match(seite, /<SpeakerTabelle\s+speakers=\{dazu\}\s+canEdit=\{canEdit\}/);
    assert.doesNotMatch(seite, /SpeakerKarte/);
    assert.match(src("app/(partner)/partner/masterclass/page.tsx"), /import \{ SpeakerKarte \} from "\.\.\/talk\/SpeakerKarte";/);
  });

  it("`Table stapeln` mit drei Spalten (Person, Stand, Aktion); eine Zeile je Person, der Knopf nur mit Recht", () => {
    assert.match(tabelle, /<Table stapeln>/);
    assert.equal((tabelle.match(/<Th\b/g) ?? []).length, 3);
    assert.match(tabelle, /<Th aria-label=\{t\.colAction\} \/>/);
    assert.match(tabelle, /const darfPflegen = canEdit && sp\.can_edit;/);
    assert.match(tabelle, /\{darfPflegen && \(\s*<Button size="sm" variant="secondary" onClick=\{\(\) => setOffen\(sp\.profile_id\)\}>/);
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
    assert.match(seite, /const kontakt = dazu\.find\(\(sp\) => sp\.mail_contact_name\)\?\.mail_contact_name \?\? null;/);
    assert.match(seite, /const pflegtSelbst = dazu\.some\(\(sp\) => !sp\.can_edit && !sp\.mail_contact_name\);/);
    assert.match(seite, /s\.speakersNoteOwn/);
    assert.match(seite, /s\.speakersNoteManaged\.replace\(\/\\\{kontakt\\\}\/g, kontakt\)/);
    // Die Sätze stehen hinter der Tabelle und vor dem Eintragen.
    const t = seite.indexOf("<SpeakerTabelle");
    assert.ok(t < seite.indexOf("s.speakersNoteOwn") && seite.indexOf("s.speakersNoteOwn") < seite.indexOf("<SpeakerHinzufuegen"));
  });

  it("Eintragen, leerer Zustand und Programmhinweis bleiben", () => {
    assert.match(seite, /<SpeakerHinzufuegen\s+sessionId=\{x\.id\}/);
    assert.match(seite, /<p className="ct-help">\{s\.noSpeakerYet\}<\/p>/);
    assert.match(seite, /<p className="ct-help">\{s\.programmeHint\}<\/p>/);
  });
});

describe("PART-136: Texte", () => {
  it("alle benutzten Schlüssel stehen in DE und EN; die Sätze nennen die Marken beim Namen", () => {
    const benutzt = (text: string, praefix: string) =>
      [...new Set([...text.matchAll(new RegExp(`\\b${praefix}\\.([a-zA-Z]+)`, "g"))].map((m) => m[1]))];
    const keys = [...benutzt(seite, "s"), ...benutzt(tabelle, "t")];
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
