import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * SPK-089 (Feedbackrunde Konrad und Paulina 05.10.2026): „Deine Kontakte“ (Assistenz, Agentur, Office) als eigener Menüpunkt mit eigener Seite,
 * und beim Anlegen die **Pflichtfrage** „Darf sich diese Person im Portal anmelden und dein Profil bearbeiten?“ — Ja oder Nein, ohne Vorauswahl,
 * ohne Antwort kein Speichern. Keine Migration: `upsert_speaker_contact` nimmt `has_access` schon explizit. Hier steht, was sich ohne Browser
 * festhalten lässt.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") => JSON.parse(quelle(`lib/i18n/${sprache}.json`));
/** TypeScript ohne Kommentare — damit eine Erklärung im Quelltext nicht als Treffer zählt. */
const tscode = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const LAYOUT = "app/(speaker)/layout.tsx";
const SEITE = "app/(speaker)/speaker/kontakte/page.tsx";
const WRAPPER = "app/(speaker)/speaker/kontakte/KontakteSeite.tsx";
const KARTE = "components/speaker/KontakteCard.tsx";
const AKTIONEN = "app/(speaker)/speaker/actions.ts";
const ADMIN = "app/(admin)/admin/speaker/[id]/Detail.tsx";

describe("SPK-089: Menü und Seite", () => {
  it("im Menü steht „Deine Kontakte“ gleich nach dem Profil — genau einmal", () => {
    const layout = tscode(quelle(LAYOUT));
    const von = layout.indexOf("groups={[");
    const bis = layout.indexOf("]}\n    >", von);
    assert.ok(von > 0 && bis > von, "die Menügruppen fehlen");
    const pfade = [...layout.slice(von, bis).matchAll(/href: "(\/speaker[^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(pfade.slice(0, 3), ["/speaker", "/speaker/profil", "/speaker/kontakte"]);
    assert.equal(pfade.filter((p) => p === "/speaker/kontakte").length, 1);
    assert.match(layout, /\{ href: "\/speaker\/kontakte", label: t\.speaker\.navContacts \},/);
  });

  it("die Seite: Anmeldung auf dem Speaker-Bereich, das gewählte Profil, Kopf mit Titel „Deine Kontakte“; ohne Profil der Leerzustand wie im Profil", () => {
    const s = tscode(quelle(SEITE));
    assert.match(s, /await requireArea\("speaker", "\/speaker\/kontakte"\);/);
    assert.match(s, /supabase\.rpc\("my_speaker_profile"\)/);
    assert.match(s, /<PageHeader word=\{t\.speaker\.wordBackstage\} title=\{t\.speaker\.sectionContacts\} description=\{t\.speaker\.contactsPageLead\} \/>/);
    assert.match(s, /if \(!profile\) \{\s+return \(\s+<>\s+\{kopf\}\s+<EmptyState title=\{t\.speaker\.noProfileTitle\} description=\{t\.speaker\.noProfileBody\} \/>/);
    assert.match(s, /export const dynamic = "force-dynamic";/);
  });

  it("die Karte steht ohne eigenen Titel (die Seite trägt ihn), die Assistenz sieht sie nur lesend, geschrieben wird über die vorhandenen Aktionen", () => {
    const w = tscode(quelle(WRAPPER));
    assert.match(w, /readOnly=\{profile\.is_assistant\}/);
    assert.match(w, /aktionen=\{\{ save: saveSpeakerContact, remove: removeSpeakerContact \}\}/);
    assert.match(w, /\bohneTitel\b/);
    assert.match(w, /const message = \(key: string\) => rpcMessages\[key\] \?\? rpcMessages\.unknown \?\? key;/);
    // dieselben Aktionen wie bisher: sie rufen die RPCs, die Rechte prüft die Datenbank
    const a = tscode(quelle(AKTIONEN));
    assert.match(a, /supabase\.rpc\("upsert_speaker_contact", \{ p_data: data \}\)/);
    assert.match(a, /supabase\.rpc\("remove_speaker_contact", \{ p_contact_id: contactId \}\)/);
  });

  it("nach dem Speichern wird auch die neue Seite neu geladen", () => {
    assert.match(tscode(quelle(AKTIONEN)), /function refresh\(\) \{\s+revalidatePath\(PATH\);\s+revalidatePath\(`\$\{PATH\}\/profil`\);\s+revalidatePath\(`\$\{PATH\}\/kontakte`\);\s+\}/);
  });

  it("der Reiter „Person“ im Profil trägt die Kontakte nicht mehr", () => {
    assert.doesNotMatch(tscode(quelle("app/(speaker)/speaker/profil/PersonTab.tsx")), /KontakteCard|saveSpeakerContact|removeSpeakerContact/);
  });
});

describe("SPK-089: die Pflichtfrage in der Karte", () => {
  it("beim Anlegen ist die Antwort offen (`null`), beim Bearbeiten steht die bisherige da", () => {
    const k = tscode(quelle(KARTE));
    assert.match(k, /has_access: null as boolean \| null,/);
    assert.match(k, /has_access: k\.has_access,\s+\}\);/);
  });

  it("zwei Antworten als Radio, beide ohne Vorauswahl; die Frage ist als Pflicht gekennzeichnet (Stern und Wort), kein Häkchen mehr für den Zugang", () => {
    const k = tscode(quelle(KARTE));
    assert.match(k, /<fieldset className="mt-4">\s+<legend className="ct-label text-ink">\s+\{t\.contactAccessQuestion\}/);
    assert.match(k, /\(\{t\.contactAccessRequired\}\)/);
    assert.match(k, /\(\[true, false\] as const\)\.map\(\(antwort\) => \(/);
    assert.match(k, /type="radio"\s+name="k_access"/);
    assert.match(k, /checked=\{form\.has_access === antwort\}/);
    assert.match(k, /onChange=\{\(\) => setForm\(\(f\) => \(\{ \.\.\.f, has_access: antwort \}\)\)\}/);
    assert.match(k, /\{antwort \? t\.contactAccessYes : t\.contactAccessNo\}/);
    // das alte Häkchen für den Zugang ist weg; die Einwilligung der Person bleibt ein Häkchen
    assert.doesNotMatch(k, /t\.contactAccess\}/);
    assert.equal((k.match(/type="checkbox"/g) ?? []).length, 1, "nur das Häkchen der Einwilligung");
    assert.match(k, /\{t\.contactConsent\}/);
  });

  it("ohne Antwort kein Speichern; „Ja“ verlangt die E-Mail-Adresse (der Hinweis erscheint erst bei „Ja“); gesendet wird ein echtes Boolean", () => {
    const k = tscode(quelle(KARTE));
    assert.match(k, /pending \|\| !gefuellt \|\| !consent \|\| form\.has_access === null \|\| \(form\.has_access === true && !form\.email\.trim\(\)\)/);
    assert.match(k, /hint=\{form\.has_access === true \? t\.contactEmailRequired : undefined\}/);
    assert.match(k, /has_access: form\.has_access === true,\s+consent_at:/);
  });

  it("der Titel steht nur, wenn die Seite ihn nicht schon trägt — Admin und Profil setzen `ohneTitel` nicht", () => {
    const k = tscode(quelle(KARTE));
    assert.match(k, /ohneTitel = false,/);
    assert.match(k, /\{!ohneTitel && <Kopf className=\{`\$\{ebene === "h2" \? "ct-h2" : "ct-h3"\} mb-1 text-ink`\}>\{t\.sectionContacts\}<\/Kopf>\}/);
    const admin = tscode(quelle(ADMIN));
    const aufruf = admin.slice(admin.indexOf("<KontakteCard"), admin.indexOf("/>", admin.indexOf("<KontakteCard")));
    assert.doesNotMatch(aufruf, /ohneTitel/);
  });

  it("der Admin pflegt Kontakte mit derselben Karte und derselben Frage (Admin-Vollständigkeit) — mit dem Wortlaut „das Profil“", () => {
    const admin = tscode(quelle(ADMIN));
    assert.match(admin, /<KontakteCard\s+kontakte=\{speaker\.speaker_contacts \?\? \[\]\}\s+readOnly=\{false\}\s+profileId=\{speaker\.id\}/);
    assert.match(woerterbuch("de").adminSpeaker.contactAccessQuestion, /das Profil bearbeiten\?$/);
    assert.match(woerterbuch("en").adminSpeaker.contactAccessQuestion, /edit the profile\?$/);
  });

  it("die Datenbank nimmt die Antwort schon explizit — keine Migration (`has_access` aus `p_data`, ohne Angabe: nein)", () => {
    const rpc = quelle("supabase/snapshot/functions/upsert_speaker_contact.sql");
    assert.match(rpc, /v_access := coalesce\(case when p_data \? 'has_access' then \(p_data->>'has_access'\)::boolean else v_alt\.has_access end, false\);/);
    assert.match(rpc, /if v_access and v_email is null then\s+raise exception 'contact_email_required'/);
  });
});

describe("SPK-089: Texte", () => {
  it("Frage, Antworten und Pflichtvermerk stehen in Deutsch und Englisch, im Speaker-Portal und im Admin; der alte Häkchen-Text ist weg", () => {
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache);
      for (const bereich of ["speaker", "adminSpeaker"]) {
        for (const k of ["contactAccessQuestion", "contactAccessYes", "contactAccessNo", "contactAccessRequired", "contactAccessHint"]) {
          assert.ok(typeof w[bereich][k] === "string" && w[bereich][k].trim() !== "", `${sprache}.${bereich}.${k}`);
        }
        assert.equal(w[bereich].contactAccess, undefined, `${sprache}.${bereich}.contactAccess (altes Häkchen) steht noch da`);
        assert.doesNotMatch(w[bereich].contactsLead, /Häkchen|checkbox/i, `${sprache}.${bereich}.contactsLead nennt noch ein Häkchen`);
      }
    }
    assert.equal(woerterbuch("de").speaker.contactAccessQuestion, "Darf sich diese Person im Portal anmelden und dein Profil bearbeiten?");
    assert.equal(woerterbuch("en").speaker.contactAccessQuestion, "May this person sign in to the portal and edit your profile?");
  });

  it("Menü und Seitenkopf: „Deine Kontakte“ / „Your contacts“, Eyebrow „Backstage“, ein Satz Erklärung", () => {
    for (const sprache of ["de", "en"] as const) {
      const s = woerterbuch(sprache).speaker;
      assert.ok(s.contactsPageLead.trim() !== "" && s.wordBackstage === "Backstage", sprache);
    }
    assert.equal(woerterbuch("de").speaker.navContacts, "Deine Kontakte");
    assert.equal(woerterbuch("en").speaker.navContacts, "Your contacts");
  });
});

describe("SPK-089: Doku", () => {
  it("Testleitfaden: eine Zeile für `/speaker/kontakte` mit der Pflichtfrage, der Sperre des Speicherns und dem Admin-Gegenstück; die Profil-Zeile nennt die Kontakte nicht mehr als Teil des Reiters", () => {
    const leitfaden = quelle("docs/team-testleitfaden.md");
    const zeile = leitfaden.split("\n").find((l) => l.startsWith("| `/speaker/kontakte` Deine Kontakte (SPK-089) |"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /\*\*Pflichtfrage\*\* „Darf sich diese Person im Portal anmelden und dein Profil bearbeiten\?“ \(Ja \/ Nein, \*\*ohne Vorauswahl\*\*\)/);
    assert.match(zeile, /„Speichern“ bleibt gesperrt, solange die Frage unbeantwortet ist/);
    assert.match(zeile, /`\/admin\/speaker\/<Profil>`/);
    const profil = leitfaden.split("\n").find((l) => l.startsWith("| `/speaker/profil` Profil |")) ?? "";
    assert.match(profil, /„Person“ \(Foto, Name, Titel, Telefon, Sprache\)/);
    assert.match(profil, /stehen seit SPK-089 auf `\/speaker\/kontakte`/);
  });

  it("Backlog: SPK-089 trägt die PR-Nummer; SPK-095 (Bereinigung der Altbestände im Audit, Plans Auftrag) ist eingetragen und steht genau einmal da", () => {
    const backlog = quelle("docs/feedback/speaker.md").split("\n");
    const s89 = backlog.find((l) => l.startsWith("| SPK-089 |"));
    assert.ok(s89 && /\| P1 \| (geplant|gebaut|abgenommen) #\d+/.test(s89), "SPK-089 trägt keine PR-Nummer");
    const s95 = backlog.filter((l) => l.startsWith("| SPK-095 |"));
    assert.equal(s95.length, 1, "SPK-095 steht nicht genau einmal da");
    assert.match(s95[0], /speaker\.assistant_update/);
    assert.match(s95[0], /Altbestände|Bestandseinträge/);
  });
});
