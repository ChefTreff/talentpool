import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  i18n,
  OPTIONALE_FELDER,
  personenAus,
  speakerDocId,
  speakerFassung,
  speakerFelder,
  speakerMutationen,
  speakerPlan,
  SPEAKER_TYPE,
  type SpeakerRef,
  type SpeakerZeile,
} from "@/lib/sanity/speaker-mapping";

/**
 * SPK-046: Speaker für die Website. Kein Test spricht mit Sanity — geprüft werden Tor, Dokument,
 * Fingerabdruck, Mutationen und der Plan (anlegen, ändern, entfernen, zurückhalten).
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");

const ZEILE: SpeakerZeile = {
  person_id: "p1",
  profile_id: "sp1",
  edition_id: "e27",
  edition_slug: "fls27",
  edition_start: "2027-04-15",
  first_name: "Anna",
  last_name: "Beispiel",
  job_title: " CEO ",
  organization: "Beispiel GmbH",
  bio_short_de: "Kurz DE",
  bio_short_en: "Short EN",
  website: "https://beispiel.example.org",
  linkedin: "https://www.linkedin.com/in/anna-beispiel",
  photo_path: "e27/sp1/photo/a.jpg",
  photo_asset_id: "asset-1",
  photo_mime: "image/jpeg",
  pipeline_status: "published",
  has_release: true,
  has_photo_video: true,
  released: true,
  is_test: false,
  sessions: [{ id: "s1", title_de: "Zukunft", title_en: "Future", stage: "Main Stage" }],
};

const person = (z: Partial<SpeakerZeile> = {}) => personenAus([{ ...ZEILE, ...z }])[0];

describe("Tor", () => {
  it("lässt nur durch, wer beide Einwilligungen hat und veröffentlicht ist", () => {
    assert.deepEqual(person().gruende, []);
    assert.deepEqual(person({ has_release: false }).gruende, ["keine_freigabe_einwilligung"]);
    assert.deepEqual(person({ has_photo_video: false }).gruende, ["keine_foto_einwilligung"]);
    assert.deepEqual(person({ released: false, pipeline_status: "confirmed" }).gruende, ["nicht_veroeffentlicht"]);
    assert.deepEqual(person({ last_name: " " }).gruende, ["kein_name"]);
  });

  it("hält Testprofile immer zurück, auch wenn alles andere stimmt", () => {
    assert.deepEqual(person({ is_test: true }).gruende, ["testdaten"]);
  });

  it("bündelt Jahrgänge: eine Person, Editionen aufsteigend, Felder aus der jüngsten freigegebenen", () => {
    const [p] = personenAus([
      { ...ZEILE, edition_slug: "fls28", edition_start: "2028-04-13", edition_id: "e28", job_title: "Gründerin", sessions: [{ id: "s2", title_de: "Neu", title_en: "New", stage: null }] },
      ZEILE,
      { ...ZEILE, edition_slug: "fls26", edition_start: "2026-04-16", edition_id: "e26", released: false },
    ]);
    assert.deepEqual(p.editionen, ["fls27", "fls28"]);
    assert.equal(p.quelle.job_title, "Gründerin");
    assert.deepEqual(p.sessions.map((s) => `${s.id}@${s.editionSlug}`), ["s1@fls27", "s2@fls28"]);
  });
});

describe("Dokument", () => {
  it("hat eine ID je Person mit Bindestrich, nie mit Punkt", () => {
    assert.equal(speakerDocId("p1"), "speaker-p1");
    assert.ok(!speakerDocId("8d2c0f0e-0000-4000-8000-000000000000").includes("."));
  });

  it("enthält genau die Felder des Kontrakts — keine privaten Daten", () => {
    const f = speakerFelder(person(), "image-abc-100x100-webp");
    assert.deepEqual(Object.keys(f).sort(), ["bio", "company", "editions", "linkedin", "name", "personId", "photo", "role", "sessions", "website"]);
    const text = JSON.stringify(f);
    for (const verboten of ["@", "geheim", "phone", "email", "notes", "hotel", "x.com"]) assert.ok(!text.includes(verboten), verboten);
  });

  it("schreibt Sprachfelder wie das Studio: _key = Sprache, nur vorhandene Sprachen", () => {
    const f = speakerFelder(person({ bio_short_en: null }), null);
    assert.deepEqual(f.bio, [{ _key: "de", _type: "internationalizedArrayTextValue", language: "de", value: "Kurz DE" }]);
    assert.deepEqual(f.role?.map((r) => `${r.language}:${r.value}`), ["de:CEO", "en:CEO"]);
    assert.equal(i18n("internationalizedArrayStringValue", { de: " ", en: null }), undefined);
    assert.equal(f.photo, undefined, "ohne Sanity-Bild kein Foto-Feld");
  });

  it("nimmt nur http(s)-Adressen als Link", () => {
    const f = speakerFelder(person({ website: "javascript:alert(1)", linkedin: "linkedin.com/in/x" }), null);
    assert.equal(f.website, undefined);
    assert.equal(f.linkedin, undefined);
  });

  it("legt nur an, wenn es fehlt, und patcht genau unsere Felder — visible bleibt beim Web-Team", () => {
    const f = speakerFelder(person({ linkedin: null }), null);
    const [anlegen, patch] = speakerMutationen("speaker-p1", f, "2026-10-02T10:00:00.000Z");
    assert.deepEqual(anlegen, { createIfNotExists: { _id: "speaker-p1", _type: SPEAKER_TYPE, visible: true } });
    const p = (patch as { patch: { id: string; set: Record<string, unknown>; unset?: string[] } }).patch;
    assert.equal(p.id, "speaker-p1");
    assert.ok(!("visible" in p.set), "der Schalter des Web-Teams wird nie überschrieben");
    assert.equal(p.set.portalUpdatedAt, "2026-10-02T10:00:00.000Z");
    assert.deepEqual(p.unset, ["linkedin", "photo"]);
    assert.ok(OPTIONALE_FELDER.every((k) => !(p.unset ?? []).includes(k) || !(k in p.set)));
    assert.ok(!lies("lib/sanity/speaker-mapping.ts").includes("createOrReplace:"), "nie createOrReplace");
  });
});

describe("Fassung", () => {
  it("ist stabil und ändert sich mit Bio, Foto-Fassung oder Session — ohne Namen im Fingerabdruck", () => {
    const a = speakerFassung(person());
    assert.equal(speakerFassung(person()).fassung, a.fassung);
    assert.notEqual(speakerFassung(person({ bio_short_de: "Neu" })).fassung, a.fassung);
    assert.notEqual(speakerFassung(person({ photo_asset_id: "asset-2" })).fassung, a.fassung);
    assert.notEqual(speakerFassung(person({ sessions: [] })).fassung, a.fassung);
    assert.ok(!JSON.stringify(a).includes("Anna"), "nur Fingerabdrücke");
    assert.deepEqual(Object.keys(a.teile).sort(), ["bio", "company", "editions", "linkedin", "name", "photo", "role", "sessions", "website"]);
  });
});

describe("Plan", () => {
  const ref = (personId: string, meta: Partial<NonNullable<SpeakerRef["meta"]>>): SpeakerRef => ({
    object_id: personId,
    external_id: speakerDocId(personId),
    meta,
  });

  it("legt an, ändert mit Feldliste, lässt Unverändertes und hält Zurückgehaltene zurück", () => {
    const neu = person({ person_id: "p1" });
    const geaendert = person({ person_id: "p2", last_name: "Zwei" });
    const gleich = person({ person_id: "p3", last_name: "Drei" });
    const ohne = person({ person_id: "p4", last_name: "Vier", has_release: false });
    const fG = speakerFassung(gleich);
    const fA = speakerFassung({ ...geaendert, quelle: { ...geaendert.quelle, bio_short_de: "alt" } });
    const plan = speakerPlan([neu, geaendert, gleich, ohne], [
      ref("p2", { fassung: fA.fassung, teile: fA.teile, photo_asset_id: "asset-1", sanity_asset_id: "image-x" }),
      ref("p3", { fassung: fG.fassung, teile: fG.teile, photo_asset_id: "asset-1", sanity_asset_id: "image-y" }),
    ]);
    assert.deepEqual(plan.uebertragen.map((e) => `${e.person.personId}:${e.art}`), ["p1:anlegen", "p2:aendern"]);
    assert.deepEqual(plan.uebertragen.find((e) => e.art === "aendern")?.geaendert, ["bio"]);
    assert.equal(plan.uebertragen.find((e) => e.art === "aendern")?.fotoNeu, false, "gleiches Foto, schon in Sanity");
    assert.equal(plan.uebertragen.find((e) => e.art === "anlegen")?.fotoNeu, true);
    assert.deepEqual(plan.unveraendert.map((p) => p.personId), ["p3"]);
    assert.deepEqual(plan.zurueckgehalten.map((p) => p.personId), ["p4"]);
    assert.deepEqual(plan.entfernen, []);
  });

  it("entfernt, wer zurückgezogen hat oder gar nicht mehr da ist — mit Foto", () => {
    const widerruf = person({ person_id: "p5", last_name: "Fünf", has_release: false });
    const plan = speakerPlan([widerruf], [
      ref("p5", { fassung: "alt", sanity_asset_id: "image-p5" }),
      ref("p6", { fassung: "alt", sanity_asset_id: null }),
    ]);
    assert.deepEqual(
      plan.entfernen.map((e) => `${e.docId}:${e.sanityAssetId}:${e.name}:${e.gruende.join("+")}`),
      ["speaker-p5:image-p5:Anna Fünf:keine_freigabe_einwilligung", "speaker-p6:null:null:"],
    );
  });

  it("lädt ein Foto neu, wenn die Fassung im Portal wechselt", () => {
    const p = person({ photo_asset_id: "asset-2" });
    const f = speakerFassung(person());
    const plan = speakerPlan([p], [ref("p1", { fassung: f.fassung, teile: f.teile, photo_asset_id: "asset-1", sanity_asset_id: "image-alt" })]);
    assert.equal(plan.uebertragen[0].fotoNeu, true);
    assert.deepEqual(plan.uebertragen[0].geaendert, ["photo"]);
  });
});

describe("Verdrahtung (Quelltext)", () => {
  it("prüft in der Route erst Abschnitt und Speaker-Team, dann den Schalter, dann service_role", () => {
    const src = lies("app/api/admin/sanity/speakers/route.ts");
    const abschnitt = src.indexOf('requireAdminSection("speakers"');
    const team = src.indexOf('rpc("is_speaker_team"');
    const schalter = src.indexOf("speakerSchreibenErlaubt()");
    const admin = src.indexOf("createSupabaseAdminClient()", src.indexOf("export async function POST"));
    assert.ok(abschnitt > 0 && team > abschnitt && schalter > team && admin > schalter);
    assert.ok(src.includes("istTrockenlauf(body)"), "nur ein ausdrückliches dryRun: false schreibt");
  });

  it("schreibt im Echtlauf erst nach dem Schalter und entfernt vorher, was weg muss", () => {
    const src = lies("lib/sanity/speakers.ts");
    assert.ok(src.startsWith('import "server-only";'));
    const echtlauf = src.indexOf("// Echtlauf.");
    const entfernen = src.indexOf("for (const e of plan.entfernen)", echtlauf);
    const schalter = src.indexOf("if (!lauf.schreibenErlaubt)", echtlauf);
    const schreiben = src.indexOf("for (const e of plan.uebertragen)", echtlauf);
    assert.ok(echtlauf > 0 && entfernen > echtlauf && schalter > entfernen && schreiben > schalter);
    assert.ok(src.includes("{ dryRun: true }"), "die Vorschau schreibt nie");
    assert.ok(src.includes("verkleinere("), "Foto ohne Metadaten (ADM-042)");
    // Viewer-Token: auch dryRun verlangt Schreibrecht — einmal vermerken, nicht je Person als Fehler.
    assert.match(src, /err instanceof SanityError && err\.status === 403\) \{\s*lauf\.pruefung = "token_read_only";\s*break;/);
  });

  it("nimmt im Cron nur heraus, nie hinein", () => {
    const cron = lies("app/api/cron/mail/route.ts");
    assert.ok(cron.includes("await speakerRuecknahme(admin)"));
    const ruecknahme = lies("lib/sanity/speakers.ts").split("export async function speakerRuecknahme")[1] ?? "";
    assert.ok(!ruecknahme.includes("speakerMutationen") && !ruecknahme.includes("sanityUploadImage"));
  });

  it("liest die Umgebung nur im Server-Teil, und der Schalter steht im Beispiel auf aus", () => {
    assert.ok(!lies("lib/sanity/speaker-mapping.ts").includes("process.env"));
    assert.match(lies(".env.local.example"), /^SANITY_SPEAKERS_WRITE_ENABLED=false/m);
  });

  it("hat jeden Text der Seite in beiden Sprachen", () => {
    const karte = lies("app/(admin)/admin/speaker/website/WebsiteSpeaker.tsx") + lies("app/(admin)/admin/speaker/website/page.tsx");
    const genutzt = new Set([...karte.matchAll(/\bt\.([A-Za-z]+)\b/g)].map((m) => m[1]));
    genutzt.delete("admin");
    genutzt.delete("adminSpeakerWebsite");
    const gruende = ["testdaten", "kein_name", "keine_freigabe_einwilligung", "keine_foto_einwilligung", "nicht_veroeffentlicht"];
    const felder = ["name", "role", "company", "bio", "website", "linkedin", "photo", "sessions", "editions"];
    for (const sprache of ["de", "en"]) {
      const d = JSON.parse(lies(`lib/i18n/${sprache}.json`)) as { adminSpeakerWebsite: Record<string, string> };
      for (const k of genutzt) assert.ok(d.adminSpeakerWebsite[k], `${sprache}: ${k}`);
      for (const g of gruende) assert.ok(d.adminSpeakerWebsite[`grund_${g}`], `${sprache}: grund_${g}`);
      for (const f of felder) assert.ok(d.adminSpeakerWebsite[`feld_${f}`], `${sprache}: feld_${f}`);
      for (const e of ["write_disabled", "forbidden", "run_failed", "sanity_missing"]) assert.ok(d.adminSpeakerWebsite[`err_${e}`], `${sprache}: err_${e}`);
    }
  });
});
