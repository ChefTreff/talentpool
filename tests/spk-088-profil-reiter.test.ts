import { strict as assert } from "node:assert";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PROFIL_REITER,
  STANDARD_REITER,
  leseReiter,
  profilSchrittHref,
  reiterHref,
  reiterTextSchluessel,
} from "@/lib/speaker/profil-reiter";
import { STEP_HREF } from "@/app/(speaker)/speaker/types";

/**
 * SPK-088 (Feedbackrunde Konrad und Paulina 05.10.2026; Plan 09.10.: URL-Reiter mit `SectionTabs`, ein Entwurf je Reiter, `useUngesichert` beim
 * Wechsel): das Profil steht im Menü gleich nach der Übersicht und gliedert sich in drei Reiter — Person · Auftritt & Bio · Ernährung &
 * Einwilligungen. Hier steht, was sich ohne Browser festhalten lässt; die reinen Hilfen werden **ausgeführt**.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") => JSON.parse(quelle(`lib/i18n/${sprache}.json`));
/** TypeScript ohne Kommentare — damit eine Erklärung im Quelltext nicht als Treffer zählt. */
const tscode = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SEITE = "app/(speaker)/speaker/profil/page.tsx";
const PERSON = "app/(speaker)/speaker/profil/PersonTab.tsx";
const AUFTRITT = "app/(speaker)/speaker/profil/AuftrittTab.tsx";
const EINWILLIGUNGEN = "app/(speaker)/speaker/profil/EinwilligungenTab.tsx";
const LAYOUT = "app/(speaker)/layout.tsx";
const UEBERSICHT = "app/(speaker)/speaker/page.tsx";

/** Die Schlüssel von `type Draft = { … }` einer Reiter-Datei. */
function entwurfsSchluessel(datei: string): string[] {
  const block = tscode(quelle(datei)).match(/type Draft = \{([\s\S]*?)\n\};/);
  assert.ok(block, `${datei}: type Draft fehlt`);
  return [...block[1].matchAll(/^\s+(\w+): string;/gm)].map((m) => m[1]);
}

describe("SPK-088: die Reiter (reine Hilfen, ausgeführt)", () => {
  it("drei Reiter in der Reihenfolge Person · Auftritt · Einwilligungen; der erste ist der Vorgabewert", () => {
    assert.deepEqual([...PROFIL_REITER], ["person", "auftritt", "einwilligungen"]);
    assert.equal(STANDARD_REITER, "person");
  });

  it("`leseReiter` nimmt nur die drei Schlüssel — alles andere führt in „Person“, ein mehrfach gesetzter Wert gilt mit dem ersten", () => {
    for (const r of PROFIL_REITER) assert.equal(leseReiter(r), r);
    for (const roh of [undefined, "", "x", "PERSON", "Auftritt", " auftritt", "consent", "person,auftritt"]) {
      assert.equal(leseReiter(roh), "person", String(roh));
    }
    assert.equal(leseReiter(["auftritt", "einwilligungen"]), "auftritt");
    assert.equal(leseReiter(["x", "auftritt"]), "person");
    assert.equal(leseReiter([]), "person");
  });

  it("die Adresse: der erste Reiter ohne Abfrage (so verlinkt ihn die Seitenleiste), die übrigen mit `?reiter=`", () => {
    assert.equal(reiterHref("person"), "/speaker/profil");
    assert.equal(reiterHref("auftritt"), "/speaker/profil?reiter=auftritt");
    assert.equal(reiterHref("einwilligungen"), "/speaker/profil?reiter=einwilligungen");
    // jede Adresse führt zum selben Reiter zurück
    for (const r of PROFIL_REITER) assert.equal(leseReiter(new URL(reiterHref(r), "https://x.example").searchParams.get("reiter") ?? undefined), r);
  });

  it("die Beschriftung: „Ernährung & Einwilligungen“ — für die Assistenz (ohne Ernährung) nur „Einwilligungen“", () => {
    assert.equal(reiterTextSchluessel("person", true), "tabPerson");
    assert.equal(reiterTextSchluessel("auftritt", false), "tabAppearance");
    assert.equal(reiterTextSchluessel("einwilligungen", true), "tabConsent");
    assert.equal(reiterTextSchluessel("einwilligungen", false), "tabConsentOnly");
    const de = woerterbuch("de").speaker;
    const en = woerterbuch("en").speaker;
    assert.equal(de.tabConsent, "Ernährung & Einwilligungen");
    assert.equal(de.tabConsentOnly, "Einwilligungen");
    assert.equal(en.tabConsent, "Diet & consents");
    assert.equal(en.tabConsentOnly, "Consents");
  });

  it("„Profil vervollständigen“ führt dorthin, wo etwas fehlt: fehlt ein Name ⇒ Person, sind beide Namen da ⇒ Auftritt & Bio", () => {
    assert.equal(profilSchrittHref({ first_name: null, last_name: null }), "/speaker/profil");
    assert.equal(profilSchrittHref({ first_name: "Ada", last_name: null }), "/speaker/profil");
    assert.equal(profilSchrittHref({ first_name: null, last_name: "Lovelace" }), "/speaker/profil");
    assert.equal(profilSchrittHref({ first_name: "  ", last_name: "Lovelace" }), "/speaker/profil", "nur Leerzeichen zählen als fehlend (wie `speaker_next_steps`)");
    assert.equal(profilSchrittHref({ first_name: "Ada", last_name: "Lovelace" }), "/speaker/profil?reiter=auftritt");
  });

  it("die Schritte der Übersicht: Einwilligungen ⇒ ihr Reiter mit Anker, Foto ⇒ Person mit Anker; der Profil-Schritt rechnet die Übersicht", () => {
    assert.equal(STEP_HREF.consents, "/speaker/profil?reiter=einwilligungen#consent");
    assert.equal(STEP_HREF.photo, "/speaker/profil#foto");
    assert.equal(STEP_HREF.profile, "/speaker/profil");
    assert.match(tscode(quelle(UEBERSICHT)), /href: key === "profile" \? profilSchrittHref\(person\) : STEP_HREF\[key\] \?\? null,/);
    // die übrigen Schritte bleiben, wie sie waren
    assert.equal(STEP_HREF.session, "/speaker/session");
    assert.equal(STEP_HREF.ticket, "/speaker/tickets");
  });
});

describe("SPK-088: Menü und Seite", () => {
  it("im Menü steht das Profil gleich nach der Übersicht — und nur dort", () => {
    const layout = tscode(quelle(LAYOUT));
    const von = layout.indexOf("groups={[");
    const bis = layout.indexOf("]}\n    >", von);
    assert.ok(von > 0 && bis > von, "die Menügruppen fehlen");
    const pfade = [...layout.slice(von, bis).matchAll(/href: "(\/speaker[^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(pfade.slice(0, 3), ["/speaker", "/speaker/profil", "/speaker/session"]);
    assert.equal(pfade.filter((p) => p === "/speaker/profil").length, 1);
    assert.deepEqual(pfade, ["/speaker", "/speaker/profil", "/speaker/session", "/speaker/travel", "/speaker/tickets", "/speaker/reisekosten", "/speaker/media", "/speaker/grafik", "/speaker/wiki"]);
    assert.match(layout, /\{ href: "\/speaker\/profil", label: t\.speaker\.navProfile \},/);
  });

  it("die Seite liest den Reiter aus der Adresse und rendert genau seinen Inhalt — und lädt nur, was er braucht", () => {
    const s = tscode(quelle(SEITE));
    assert.match(s, /searchParams: Promise<\{ reiter\?: string \| string\[\] \}>;/);
    assert.match(s, /const reiter = leseReiter\(\(await searchParams\)\.reiter\);/);
    const a = s.indexOf('if (reiter === "person")');
    const b = s.indexOf('} else if (reiter === "auftritt")');
    const c = s.indexOf("} else {", b);
    assert.ok(a > 0 && b > a && c > b, "die drei Zweige fehlen");
    const person = s.slice(a, b);
    const auftritt = s.slice(b, c);
    const einwilligungen = s.slice(c);
    // Person: Foto (signierte Adresse) und das Formular; keine Ernährung
    assert.match(person, /rpc\("my_speaker_assets"/);
    assert.match(person, /<PhotoUpload[\s\S]*?register=\{registerSpeakerPhoto\}/);
    assert.match(person, /<PersonTab profile=\{profile\}/);
    assert.doesNotMatch(person, /my_diet|loadVocabMap|DietCard/);
    // Auftritt & Bio: nur das Formular, kein weiterer Abruf
    assert.match(auftritt, /<AuftrittTab profile=\{profile\}/);
    assert.doesNotMatch(auftritt, /supabase\./);
    // Einwilligungen: Ernährung (nicht für die Assistenz), Wörterbuch und Stellvertretung
    assert.match(einwilligungen, /zeigtDiet \? supabase\.rpc\("my_diet"\)/);
    assert.match(einwilligungen, /rpc\("can_confirm_consent_on_behalf", \{ p_profile_id: profile\.id \}\)/);
    assert.match(einwilligungen, /<EinwilligungenTab[\s\S]*?consentOnBehalf=\{stellvertretend === true\}/);
    assert.match(einwilligungen, /zeigtDiet \? \(\s+<Sektion id="ernaehrung">\s+<DietCard/);
    assert.doesNotMatch(einwilligungen, /my_speaker_assets/);
    assert.match(s, /const zeigtDiet = !profile\.is_assistant;/);
  });

  it("die Leiste: `SectionTabs` mit dem gewählten Reiter als `aktiv`, den Adressen aus `reiterHref` und der Beschriftung aus dem Wörterbuch", () => {
    const s = tscode(quelle(SEITE));
    assert.match(s, /<SectionTabs\s+label=\{t\.speaker\.profileTabsLabel\}/);
    assert.match(s, /items=\{PROFIL_REITER\.map\(\(r\) => \(\{\s+href: reiterHref\(r\),\s+label: texte\[reiterTextSchluessel\(r, zeigtDiet\)\],\s+aktiv: r === reiter,\s+\}\)\)\}/);
    // die Leiste ersetzt die „Auf dieser Seite“-Übersicht: sie steht nicht zusätzlich da
    assert.doesNotMatch(s, /AbschnittsNavigation/);
  });

  it("das eine große Formular ist weg — kein Verweis mehr darauf in app/, components/ oder lib/", () => {
    assert.equal(existsSync(new URL("../app/(speaker)/speaker/profil/SpeakerProfileForm.tsx", import.meta.url)), false);
    const treffer: string[] = [];
    for (const wurzel of ["app", "components", "lib"]) {
      for (const datei of readdirSync(new URL(`../${wurzel}`, import.meta.url), { recursive: true }) as string[]) {
        if (!/\.(ts|tsx|mjs)$/.test(datei)) continue;
        if (/SpeakerProfileForm/.test(quelle(`${wurzel}/${datei}`))) treffer.push(`${wurzel}/${datei}`);
      }
    }
    assert.deepEqual(treffer, []);
  });
});

describe("SPK-088: jeder Reiter hat seinen Entwurf", () => {
  it("Person und Auftritt & Bio teilen die Profilfelder ohne Rest und ohne Überschneidung (dazu `socials` im zweiten) — es geht nichts verloren", () => {
    const person = entwurfsSchluessel(PERSON);
    const auftritt = entwurfsSchluessel(AUFTRITT);
    assert.deepEqual(person, ["first_name", "last_name", "title", "phone", "preferred_language"]);
    assert.deepEqual(auftritt, ["job_title", "organization_name", "bio_short_en", "bio_short_de", "bio_long_en", "bio_long_de", "linkedin_url"]);
    assert.deepEqual(person.filter((k) => auftritt.includes(k)), []);
    // Der Stand vor SPK-088 (ein Entwurf): genau diese zwölf Felder plus `socials` — kein Feld ist beim Teilen weggefallen.
    const frueher = ["first_name", "last_name", "title", "linkedin_url", "phone", "preferred_language", "job_title", "organization_name", "bio_short_en", "bio_short_de", "bio_long_en", "bio_long_de"];
    assert.deepEqual([...person, ...auftritt].sort(), [...frueher].sort());
    assert.match(tscode(quelle(AUFTRITT)), /socials: Object\.fromEntries\(Object\.entries\(links\)\.filter\(\(\[, v\]\) => v\.trim\(\) !== ""\)\),/);
    assert.doesNotMatch(tscode(quelle(PERSON)), /socials/);
  });

  it("jeder geschickte Schlüssel ist der RPC bekannt — sonst würde er still verworfen (Snapshot nach 0300)", () => {
    const rpc = quelle("supabase/snapshot/functions/update_my_speaker_profile.sql");
    for (const k of [...entwurfsSchluessel(PERSON), ...entwurfsSchluessel(AUFTRITT), "socials"]) {
      assert.ok(rpc.includes(`p_data ? '${k}'`), `update_my_speaker_profile kennt „${k}“ nicht`);
    }
    assert.match(rpc, /p_data->>'id'/);
  });

  it("Person und Auftritt & Bio speichern je für sich: eigene Basis, eigene Rückfrage beim Wechsel, `id` und Entwurf an die RPC", () => {
    const person = tscode(quelle(PERSON));
    const auftritt = tscode(quelle(AUFTRITT));
    for (const f of [person, auftritt]) {
      assert.match(f, /const \[basis, setBasis\] = useState\(/);
      assert.match(f, /const warnung = useUngesichert\(geaendert, common\.unsaved\);/);
      assert.match(f, /\{warnung\}/);
      assert.match(f, /useProfilSpeichern\(rpcMessages\)/);
    }
    assert.match(person, /saveSpeakerProfile\(\{ id: profile\.id, \.\.\.draft \}\)/);
    assert.match(auftritt, /saveSpeakerProfile\(\{\s+id: profile\.id,\s+\.\.\.draft,\s+socials:/);
    // Die Pflicht der kurzen englischen Bio sperrt nur den Reiter, in dem das Feld steht.
    assert.match(auftritt, /<Button onClick=\{onSave\} loading=\{pending\} disabled=\{bioMissing\}>/);
    assert.doesNotMatch(person, /disabled=\{bioMissing\}|bioMissing/);
    assert.match(auftritt, /const bioMissing = draft\.bio_short_en\.trim\(\) === "";/);
  });

  it("Einwilligungen: eigene Rückfrage und eigenes Speichern (stellvertretend oder selbst), die Ernährung steht darüber", () => {
    const f = tscode(quelle(EINWILLIGUNGEN));
    assert.match(f, /const warnung = useUngesichert\(JSON\.stringify\(consents\) !== basis, common\.unsaved\);/);
    assert.match(f, /saveSpeakerConsentsOnBehalf\(profile\.id, consents\)/);
    assert.match(f, /saveSpeakerConsents\(consents\)/);
    assert.ok(f.indexOf("{ernaehrung}") < f.indexOf('<Card id="consent"'), "die Ernährung steht über den Einwilligungen");
    assert.match(f, /const readOnlyConsent = profile\.is_assistant && !consentOnBehalf;/);
  });

  it("die Karten behalten ihre Anker — die Schritte der Übersicht und alte Lesezeichen springen weiter dorthin", () => {
    const person = quelle(PERSON);
    assert.match(person, /<Card id="person"/);
    assert.match(person, /id="kontakte"/);
    const auftritt = quelle(AUFTRITT);
    for (const id of ["auftritt", "bio", "socials"]) assert.match(auftritt, new RegExp(`<Card id="${id}"`));
    assert.match(quelle(EINWILLIGUNGEN), /<Card id="consent"/);
    assert.match(quelle(SEITE), /<div id="foto" className="mb-6 scroll-mt-20">/);
  });
});

describe("SPK-088: Texte und Doku", () => {
  it("die fünf Texte stehen in Deutsch und Englisch", () => {
    for (const sprache of ["de", "en"] as const) {
      const s = woerterbuch(sprache).speaker;
      for (const k of ["profileTabsLabel", "tabPerson", "tabAppearance", "tabConsent", "tabConsentOnly"]) {
        assert.ok(typeof s[k] === "string" && s[k].trim() !== "", `${sprache}.speaker.${k}`);
      }
      assert.equal(s.navProfile, sprache === "de" ? "Profil" : "Profile");
    }
  });

  it("Testleitfaden: die Profil-Zeile nennt die drei Reiter, die Rückfrage beim Wechsel und die Führung der Schritte", () => {
    const zeile = quelle("docs/team-testleitfaden.md").split("\n").find((l) => l.startsWith("| `/speaker/profil` Profil |"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /drei \*\*Reiter\*\* \(SPK-088/);
    assert.match(zeile, /„Person“[^|]*„Auftritt & Bio“[^|]*„Ernährung & Einwilligungen“/);
    assert.match(zeile, /ein Klick auf einen anderen Reiter mit ungespeicherten Änderungen fragt nach/);
  });

  it("Backlog: SPK-088 trägt die PR-Nummer, SPK-094 (Audit nur mit Feldnamen) ist eingetragen und offen", () => {
    const backlog = quelle("docs/feedback/speaker.md").split("\n");
    const s88 = backlog.find((l) => l.startsWith("| SPK-088 |"));
    assert.ok(s88 && /\| P1 \| (geplant|gebaut|abgenommen) #\d+/.test(s88), "SPK-088 trägt keine PR-Nummer");
    const s94 = backlog.find((l) => l.startsWith("| SPK-094 |"));
    assert.ok(s94, "SPK-094 fehlt");
    assert.match(s94, /nur die \*\*Namen der geänderten Felder\*\*/);
    assert.match(s94, /\| P2 \| offen —/);
    assert.equal(backlog.filter((l) => l.startsWith("| SPK-094 |")).length, 1, "SPK-094 steht nur einmal");
  });
});
