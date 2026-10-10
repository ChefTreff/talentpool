import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  MEDIA_KIT_ZIELGRUPPEN,
  mediaKitZielgruppen,
  zielgruppeUmschalten,
} from "@/components/partner/media-kit";

/**
 * SPK-090 (Feedbackrunde Konrad und Paulina 05.10.2026; Konrad: „Logos von ChefTreff oder ein ChefTreff-Media-Kit einmal zum Download zur Verfügung stellen für
 * beispielsweise eigene Postings“): die Media-Kit-Dateien der Edition (`edition_file`, Art `media_kit`) stehen auch den Speakern zum Download — unter
 * `/speaker/media` in der Karte „ChefTreff-Logos und Media Kit“, wie auf `/partner/media`. Das Marketing wählt **je Datei** „Sichtbar für“ (Partner, Speaker oder
 * beide) unter `/admin/grafiken`. **Keine Datenbankänderung:** `edition_files(p_audience, …)`, die Bucket-Policy `edition_file_path_allowed` und `set_edition_file`
 * (das Marketing darf die Art `media_kit` pflegen, `audience` setzen) gab es schon; der Datenweg steht im DB-Test `supabase/tests/spk090_media_kit_speaker.sql`.
 * Dieser Test hält fest, was die Route, die Oberfläche und die Speaker-Seite daraus machen.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ROUTE = "app/api/admin/media-kit/route.ts";
const ADMIN = "app/(admin)/admin/grafiken/MediaKitAdmin.tsx";
const ADMIN_SEITE = "app/(admin)/admin/grafiken/page.tsx";
const SEITE = "app/(speaker)/speaker/media/page.tsx";
const LISTE = "components/partner/MediaKitListe.tsx";

/** Eine Funktion der Route: von ihrer Signatur bis zur schließenden Klammer in Spalte 0. */
function funktion(q: string, anfang: string): string {
  const von = q.indexOf(anfang);
  assert.ok(von >= 0, `${anfang} fehlt`);
  const bis = q.indexOf("\n}\n", von);
  assert.ok(bis > von, `${anfang}: Ende nicht gefunden`);
  return q.slice(von, bis + 3);
}

describe("SPK-090: Zielgruppen des Media Kits (rein, ausgeführt)", () => {
  it("das Media Kit kennt Partner und Speaker, in dieser Reihenfolge", () => {
    assert.deepEqual([...MEDIA_KIT_ZIELGRUPPEN], ["partner", "speaker"]);
  });

  it("`mediaKitZielgruppen`: gültig ist eine nicht leere Liste aus Partner und Speaker — in fester Reihenfolge, ohne Doppelte", () => {
    assert.deepEqual(mediaKitZielgruppen(["partner"]), ["partner"]);
    assert.deepEqual(mediaKitZielgruppen(["speaker"]), ["speaker"]);
    assert.deepEqual(mediaKitZielgruppen(["speaker", "partner"]), ["partner", "speaker"]);
    assert.deepEqual(mediaKitZielgruppen(["speaker", "speaker", "partner", "partner"]), ["partner", "speaker"]);
  });

  it("`mediaKitZielgruppen`: leer, fremde Zielgruppe, Nicht-Liste und Nicht-Texte ergeben `null` — nie eine leere Liste an `set_edition_file`", () => {
    for (const roh of [[], ["talent"], ["partner", "talent"], ["volunteer", "hackathon"], ["Partner"], [1], [null], [{}], ["partner", ["speaker"]], "partner", null, undefined, {}, 0, true]) {
      assert.equal(mediaKitZielgruppen(roh), null, JSON.stringify(roh));
    }
  });

  it("`zielgruppeUmschalten`: an- und abhaken in fester Reihenfolge; die **letzte** angehakte Zielgruppe bleibt", () => {
    assert.deepEqual(zielgruppeUmschalten(["partner", "speaker"], "partner"), ["speaker"]);
    assert.deepEqual(zielgruppeUmschalten(["partner", "speaker"], "speaker"), ["partner"]);
    assert.deepEqual(zielgruppeUmschalten(["speaker"], "partner"), ["partner", "speaker"]);
    assert.deepEqual(zielgruppeUmschalten(["partner"], "speaker"), ["partner", "speaker"]);
    // die letzte bleibt
    assert.deepEqual(zielgruppeUmschalten(["speaker"], "speaker"), ["speaker"]);
    assert.deepEqual(zielgruppeUmschalten(["partner"], "partner"), ["partner"]);
    // eine Datei ohne Zielgruppe aus dem Bestand (z. B. nur `talent`): Anhaken geht
    assert.deepEqual(zielgruppeUmschalten([], "speaker"), ["speaker"]);
  });

  it("`zielgruppeUmschalten` verändert die übergebene Liste nicht", () => {
    const vorher = ["partner", "speaker"] as const;
    zielgruppeUmschalten(vorher, "partner");
    assert.deepEqual([...vorher], ["partner", "speaker"]);
  });
});

describe("SPK-090: die Route `/api/admin/media-kit`", () => {
  it("Gate und Rolle zuerst: der Schritt `audience` läuft nach `is_marketing_team` und vor der Prüfung der Edition (er trägt keine mit)", () => {
    const q = quelle(ROUTE);
    assert.match(q, /await requireAdminSection\("graphics", "\/admin\/grafiken"\);/);
    assert.match(q, /const \{ data: darf \} = await supabase\.rpc\("is_marketing_team"\);\s*if \(!darf\) return NextResponse\.json\(\{ error: "not_allowed" \}, \{ status: 403 \}\);/);
    const rolle = q.indexOf('rpc("is_marketing_team")');
    const schritt = q.indexOf('if (step === "audience") return zielgruppeAendern(supabase, body);');
    const edition = q.indexOf('const editionId = String(body.edition_id ?? "");');
    assert.ok(rolle > 0 && schritt > rolle && edition > schritt, "Reihenfolge Rolle, Schritt audience, Edition");
  });

  it("Hochladen: ohne Angabe beide Zielgruppen; ungültig oder leer ⇒ Datei wegräumen und 400 `invalid_audience`, **vor** `set_edition_file`", () => {
    const f = funktion(quelle(ROUTE), "async function eintragen(");
    assert.match(f, /const audience = body\.audience === undefined \? \[\.\.\.MEDIA_KIT_ZIELGRUPPEN\] : mediaKitZielgruppen\(body\.audience\);/);
    assert.match(
      f,
      /if \(!audience\) \{\s*await createSupabaseAdminClient\(\)\.storage\.from\(BUCKET\)\.remove\(\[path\]\);\s*return NextResponse\.json\(\{ error: "invalid_audience" \}, \{ status: 400 \}\);\s*\}/,
    );
    assert.ok(f.indexOf("if (!audience)") > 0 && f.indexOf("if (!audience)") < f.indexOf('rpc("set_edition_file"'), "erst prüfen, dann schreiben");
    // die geprüfte Liste geht an die Funktion — nicht mehr fest `["partner"]`
    assert.match(f, /\n      audience,\n/);
    assert.doesNotMatch(f, /audience: \["partner"\]/);
  });

  it("Zielgruppe ändern: Eingabe prüfen, die **Art der gelesenen Zeile** verlangen (nur Media Kit), dann `set_edition_file` mit der Sitzung — nie `service_role`", () => {
    const f = funktion(quelle(ROUTE), "async function zielgruppeAendern(");
    assert.match(f, /const audience = mediaKitZielgruppen\(body\.audience\);/);
    assert.match(f, /if \(!UUID\.test\(id\) \|\| !audience\) return NextResponse\.json\(\{ error: "invalid_request" \}, \{ status: 400 \}\);/);
    assert.ok(f.indexOf('rpc("edition_files_admin")') > 0 && f.indexOf('rpc("edition_files_admin")') < f.indexOf('rpc("set_edition_file"'), "erst lesen, dann schreiben");
    assert.match(f, /if \(!datei \|\| datei\.kind !== ART\) return NextResponse\.json\(\{ error: "not_found" \}, \{ status: 404 \}\);/);
    assert.match(f, /rpc\("set_edition_file", \{ p_data: \{ id, kind: ART, audience \} \}\)/);
    assert.match(f, /status: error\.code === "42501" \? 403 : 400/);
    assert.doesNotMatch(f, /createSupabaseAdminClient/, "mit der Sitzung: Rolle und Audit nennen die Person");
  });

  it("die Route reicht nirgends eine leere Zielgruppenliste weiter (beim Anlegen hieße das: alle fünf Zielgruppen — DB-Test Schritt 06)", () => {
    const q = quelle(ROUTE);
    assert.doesNotMatch(q, /audience: \[\s*\]/);
    assert.doesNotMatch(q, /audience: "\[\]"/);
    // genau zwei Stellen setzen `audience` an der Funktion: Anlegen und Ändern, beide mit der geprüften Liste
    assert.equal((q.match(/rpc\("set_edition_file"/g) ?? []).length, 2);
  });
});

describe("SPK-090: Admin — „Sichtbar für“ im Media Kit (`/admin/grafiken`)", () => {
  it("beim Hochladen beide Kästchen angehakt; die Wahl geht im zweiten Schritt mit", () => {
    const q = quelle(ADMIN);
    assert.match(q, /useState<MediaKitZielgruppe\[\]>\(\[\.\.\.MEDIA_KIT_ZIELGRUPPEN\]\)/);
    assert.match(q, /label_en: labelEn\.trim\(\),\s*audience: zielgruppen,\s*\}\);/);
    assert.match(q, /import \{ Checkbox \} from "@\/components\/ui\/Checkbox";/);
  });

  it("jede Datei trägt dieselben zwei Kästchen; Umschalten ruft `?step=audience` mit der neuen Liste auf und lädt neu", () => {
    const q = quelle(ADMIN);
    assert.match(q, /const neu = zielgruppeUmschalten\(angehakt\(datei\), z\);/);
    assert.match(q, /postJson<\{ ok: boolean \}>\("\/api\/admin\/media-kit\?step=audience", \{\s*id: datei\.id,\s*audience: neu,\s*\}\)/);
    assert.match(q, /toast\("success", t\.audienceSaved\);\s*router\.refresh\(\);/);
    assert.match(q, /toast\("error", res\.key === "not_allowed" \? t\.uploadNotAllowed : t\.audienceFailed\)/);
    assert.match(q, /onChange=\{\(\) => zielgruppeAendern\(f, z\)\}/);
  });

  it("die **letzte** angehakte Zielgruppe ist gesperrt — beim Hochladen wie an jeder Datei (die Route erzwingt es auch)", () => {
    const q = quelle(ADMIN);
    assert.match(q, /disabled=\{busy \|\| \(zielgruppen\.length === 1 && zielgruppen\.includes\(z\)\)\}/);
    assert.match(q, /disabled=\{gewaehlt\.length === 1 && gewaehlt\.includes\(z\)\}/);
  });

  it("die Titelspalte der Zeile hat eine Mindestbasis, sonst bekäme der Titel am Handy nur den Rest neben Kästchen und Knopf (Sichtprüfung 375 px)", () => {
    assert.match(quelle(ADMIN), /<span className="ct-small min-w-0 flex-1 basis-48 text-ink">/);
    assert.match(quelle(LISTE), /<span className="ct-small min-w-0 flex-1 basis-48 text-ink">/);
  });

  it("die Seite reicht die sechs neuen Texte durch", () => {
    const q = quelle(ADMIN_SEITE);
    for (const [schluessel, wert] of [
      ["audience", "mediaKitAudience"],
      ["audienceHint", "mediaKitAudienceHint"],
      ["audience_partner", "mediaKitAudiencePartner"],
      ["audience_speaker", "mediaKitAudienceSpeaker"],
      ["audienceSaved", "mediaKitAudienceSaved"],
      ["audienceFailed", "mediaKitAudienceFailed"],
    ]) {
      assert.ok(q.includes(`${schluessel}: g.${wert},`), `${schluessel}`);
    }
  });

  it("der Datensatz kennt die Zielgruppen: `edition_files_admin` liefert `audience`, der Typ nimmt sie auf", () => {
    assert.match(quelle(ADMIN), /\/\*\* Wer die Datei sieht \(`kb_audience`\)[^*]*\*\/\s*audience: string\[\];/);
    assert.match(quelle("supabase/snapshot/functions/edition_files_admin.sql"), /label_en text, audience text\[\]/);
  });
});

describe("SPK-090: Speaker — `/speaker/media`", () => {
  it("liest das Media Kit der Edition des eigenen Profils mit der Zielgruppe `speaker` — nur die Art `media_kit`", () => {
    const q = quelle(SEITE);
    assert.match(q, /await requireArea\("speaker", "\/speaker\/media"\);/);
    assert.match(q, /supabase\.rpc\("my_speaker_profile"\)/);
    assert.match(q, /supabase\.rpc\("edition_files", \{\s*p_audience: "speaker",\s*p_edition_id: profile\?\.edition_id \?\? null,\s*\}\)/);
    assert.match(q, /\.filter\(\(d\) => d\.kind === "media_kit"\)/);
  });

  it("signiert die Links mit der Sitzung des Speakers (Bucket `edition-files`, als Anhang) — kein `service_role`: die Bucket-Policy lässt nur die Zielgruppe der Datei lesen", () => {
    const q = quelle(SEITE);
    assert.match(q, /supabase\.storage\.from\("edition-files"\)\.createSignedUrl\(d\.storage_path, URL_GUELTIG_SEKUNDEN, \{ download: d\.filename \}\)/);
    assert.doesNotMatch(q, /createSupabaseAdminClient|service_role/);
  });

  it("die Karte steht **oben**, vor den Bühnenfotos; sie hat einen Anker, eine `h2`, die Liste und den Leerzustand „Das Media Kit folgt“", () => {
    const q = quelle(SEITE);
    const karte = q.indexOf('<Card id="media-kit">');
    const fotos = q.indexOf('<section id="fotos"');
    assert.ok(karte > 0 && fotos > karte, "Media Kit vor den Fotos");
    assert.match(q, /<CardHeader ebene="h2" title=\{t\.speakerMedia\.kitTitle\} description=\{t\.speakerMedia\.kitLead\} \/>/);
    assert.match(q, /<EmptyState title=\{t\.speakerMedia\.kitEmptyTitle\} description=\{t\.speakerMedia\.kitEmptyBody\} \/>/);
    assert.match(q, /<MediaKitListe\s+dateien=\{kit\}\s+links=\{kitLinks\}\s+locale=\{locale\}\s+dateLocale=\{t\.meta\.dateLocale\}\s+downloadLabel=\{t\.speakerMedia\.download\}\s+\/>/);
  });

  it("die Bühnenfotos bleiben, wie sie waren — nur als eigener Abschnitt: `h2` „Bühnenfotos“, die Session-Überschriften darunter eine Ebene tiefer", () => {
    const q = quelle(SEITE);
    assert.match(q, /<h2 id="h-fotos" className="ct-h2 mb-4 text-ink">\s*\{t\.speakerMedia\.photosTitle\}\s*<\/h2>/);
    assert.match(q, /<h3 className="ct-label text-ink">\{g\.titel \?\? t\.speaker\.untitled\}<\/h3>/);
    assert.match(q, /rpc\("my_session_photos"\)/);
    assert.equal((q.match(/\.from\(BUCKET\)/g) ?? []).length, 2, "Ansicht und Download der Fotos");
    assert.match(q, /href="\/speaker\/grafik"/);
  });

  it("die Liste: Titel in der Sprache der Person, Dateiname und Größe, `ButtonDownload`; ohne signierte Adresse bleibt die Zeile, nur ohne Knopf", () => {
    const q = quelle(LISTE);
    assert.match(q, /dateiTitel\(d, locale\)/);
    assert.match(q, /dateiGroesse\(d\.size_bytes, dateLocale\)/);
    assert.match(q, /\{link && \(\s*<ButtonDownload href=\{link\} variant="secondary" size="sm">/);
  });
});

describe("SPK-090: Texte DE und EN", () => {
  type Woerterbuch = { adminGrafiken: Record<string, string>; speakerMedia: Record<string, string> };
  const de = JSON.parse(quelle("lib/i18n/de.json")) as Woerterbuch;
  const en = JSON.parse(quelle("lib/i18n/en.json")) as Woerterbuch;

  it("alle neuen Schlüssel haben in beiden Sprachen einen Text", () => {
    for (const w of [de, en]) {
      for (const k of ["mediaKitAudience", "mediaKitAudienceHint", "mediaKitAudiencePartner", "mediaKitAudienceSpeaker", "mediaKitAudienceSaved", "mediaKitAudienceFailed"]) {
        assert.ok(w.adminGrafiken[k]?.trim(), `adminGrafiken.${k}`);
      }
      for (const k of ["kitTitle", "kitLead", "kitEmptyTitle", "kitEmptyBody", "lead", "download", "photosTitle"]) {
        assert.ok(w.speakerMedia[k]?.trim(), `speakerMedia.${k}`);
      }
    }
  });

  it("die Sätze nennen die Speaker und die Logos: Admin-Hinweise und Seitenkopf sind nicht mehr „nur Partner“ bzw. „nur Fotos“", () => {
    assert.match(de.adminGrafiken.mediaKitLead, /Speaker unter „Deine Bilder“/);
    assert.match(en.adminGrafiken.mediaKitLead, /speakers under “Your photos”/);
    assert.match(de.adminGrafiken.mediaKitAddBody, /Partner und Speaker/);
    assert.match(en.adminGrafiken.mediaKitAddBody, /partners and speakers/);
    assert.match(de.adminGrafiken.mediaKitDeleteBody, /Partner und Speaker/);
    assert.match(en.adminGrafiken.mediaKitDeleteBody, /Partners and speakers/);
    assert.match(de.speakerMedia.lead, /ChefTreff-Logos und Vorlagen sowie die Fotos/);
    assert.match(en.speakerMedia.lead, /ChefTreff logos and templates, plus the photos/);
  });

  it("die Kästchen heißen Partner und Speaker (EN: Partners, Speakers); der Satz zur Karte sagt, wofür das Material ist", () => {
    assert.equal(de.adminGrafiken.mediaKitAudiencePartner, "Partner");
    assert.equal(de.adminGrafiken.mediaKitAudienceSpeaker, "Speaker");
    assert.equal(en.adminGrafiken.mediaKitAudiencePartner, "Partners");
    assert.equal(en.adminGrafiken.mediaKitAudienceSpeaker, "Speakers");
    assert.equal(de.speakerMedia.kitTitle, "ChefTreff-Logos und Media Kit");
    assert.equal(en.speakerMedia.kitTitle, "ChefTreff logos and media kit");
    assert.match(de.speakerMedia.kitLead, /eigenen Beiträge/);
    assert.match(en.speakerMedia.kitLead, /your own posts/);
  });
});

describe("SPK-090: Testdaten, DB-Test, Doku", () => {
  it("Testdaten: Schritt `media` legt die TEST-Datei für Partner und Speaker an und ergänzt eine vorhandene um „Speaker“ (Konrads Konto sieht die Karte)", () => {
    const q = quelle("scripts/testdaten-konrad.mjs");
    assert.match(q, /label_en: "TEST — Social post template", audience: \["partner", "speaker"\]/);
    assert.match(q, /\.select\("id, audience"\)\s*\.eq\("edition_id", ed\.id\)\.eq\("storage_path", kitPfad\)/);
    assert.match(q, /\.update\(\{ audience: \[\.\.\.new Set\(\[\.\.\.\(kit\.audience \?\? \[\]\), "partner", "speaker"\]\)\] \}\)\s*\.eq\("id", kit\.id\)/);
    assert.match(q, /SPK-090: die TEST-Datei gilt für Partner \*\*und\*\* Speaker/);
  });

  it("DB-Test: zehn Erwartungen mit `99_auswertung`, echter Rollenwechsel, die Annahme der Route (Schritt 06) und die Rücknahme (Schritt 09)", () => {
    const q = quelle("supabase/tests/spk090_media_kit_speaker.sql");
    assert.equal((q.match(/^  \('\d\d_[a-z_]+', '\^[^']+'\)[,;]$/gm) ?? []).length, 10);
    assert.match(q, /'99_auswertung'/);
    assert.match(q, /execute 'set local role authenticated';/);
    assert.match(q, /'06_leere_liste'/);
    assert.match(q, /'09_zurueckgenommen'/);
    assert.match(q, /\nrollback;\n$/);
    assert.match(quelle("supabase/tests/README.md"), /\| `spk090_media_kit_speaker\.sql` \| keine Migration \(SPK-090\) \|/);
  });

  it("Testleitfaden: `/speaker/media` nennt die Karte und `/admin/grafiken` die Wahl „Sichtbar für“, mit dem gesperrten letzten Kästchen", () => {
    const zeilen = quelle("docs/team-testleitfaden.md").split("\n");
    const speaker = zeilen.find((l) => l.startsWith("| `/speaker/media` Deine Bilder |"));
    const admin = zeilen.find((l) => l.startsWith("| `/admin/grafiken` Media Kit: „Sichtbar für“ (SPK-090) |"));
    assert.ok(speaker && admin, "Zeilen fehlen");
    assert.match(speaker, /Oben die Karte „ChefTreff-Logos und Media Kit“ \(SPK-090\)/);
    assert.match(speaker, /nur für \*\*Partner\*\* angehakt ist, steht hier nicht/);
    assert.match(admin, /Kästchen \*\*Partner\*\* und \*\*Speaker\*\*/);
    assert.match(admin, /Das \*\*letzte\*\* angehakte Kästchen ist gesperrt/);
  });

  it("Backlog: SPK-090 trägt die PR-Nummer, nennt Wächter und Weg, und sagt, dass es keine Migration gibt", () => {
    const zeile = quelle("docs/feedback/speaker.md")
      .split("\n")
      .find((l) => l.startsWith("| SPK-090 |"));
    assert.ok(zeile && /\| P2 \| (geplant|gebaut|abgenommen) #\d+/.test(zeile), "SPK-090 trägt keine PR-Nummer");
    assert.match(zeile, /keine Migration/);
    assert.match(zeile, /Sichtbar für/);
    assert.match(zeile, /`\/speaker\/media`/);
    assert.match(zeile, /spk090_media_kit_speaker\.sql/);
  });
});
