import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { FOTO_TEXTE, fotoTexte } from "@/components/speaker/foto-texte";

/**
 * LEAD-030: „Für welche Speakerin“ im Shuttle der Leads als Suche.
 * LEAD-029: Foto je Speaker hochladen — im Lead-Fenster und (Admin-Vollständigkeit)
 * im Admin-Detail, mit demselben Baustein wie im Speaker-Portal.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

describe("LEAD-030: Suche statt Einfachauswahl", () => {
  it("das Shuttle-Formular der Leads sucht über die betreuten Speaker", () => {
    const s = quelle("app/(speaker-leads)/speaker-leads/shuttle/LeadShuttle.tsx");
    assert.match(s, /<SuchAuswahl/);
    assert.doesNotMatch(s, /from "@\/components\/ui\/Select"/);
    // Stabil, sonst stösst der Effekt in SuchAuswahl die Suche bei jedem Rendern neu an.
    assert.match(s, /const suchen = useCallback\(/);
    assert.match(s, /required\s+requiredLabel=\{t\.required\}/);
  });

  it("die Texte stehen in DE und EN", () => {
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache).leads;
      for (const k of ["shuttleSpeakerSearchHint", "shuttleSpeakerRemove", "shuttleSpeakerNoHits"]) assert.ok(w[k], `${sprache}.leads.${k} fehlt`);
    }
  });
});

describe("LEAD-029: Foto hochladen", () => {
  it("ein Baustein für Portal, Lead-Fenster und Admin, je mit der Aktion des Bereichs", () => {
    assert.match(quelle("app/(speaker)/speaker/profil/page.tsx"), /register=\{registerSpeakerPhoto\}/);
    const fenster = quelle("app/(speaker-leads)/speaker-leads/SpeakerFenster.tsx");
    assert.match(fenster, /register=\{registerSpeakerPhotoAsLead\}/);
    assert.match(fenster, /variante="abschnitt"/);
    const admin = quelle("app/(admin)/admin/speaker/[id]/Detail.tsx");
    assert.match(admin, /register=\{registerSpeakerPhotoAsAdmin\}/);
  });

  it("die Aktionen stehen hinter dem Tor ihres Bereichs", () => {
    const lead = quelle("app/(speaker-leads)/speaker-leads/actions.ts");
    assert.match(lead, /export async function registerSpeakerPhotoAsLead\(input: FotoEingang\): Promise<LeadResult> \{\n  const supabase = await client\(\);/);
    const admin = quelle("app/(admin)/admin/speaker/actions.ts");
    assert.match(admin, /export async function registerSpeakerPhotoAsAdmin\(input: FotoEingang\): Promise<AdminResult> \{\n  const supabase = await client\(\);/);
  });

  it("gelesen und signiert wird mit der Sitzung, nicht mit service_role", () => {
    const f = quelle("lib/speaker/foto.ts");
    assert.doesNotMatch(f, /createSupabaseAdminClient|service_role\b.*client/);
    assert.match(f, /rpc\("register_speaker_asset"/);
  });

  it("Fehler stehen am Knopf, nicht als Toast", () => {
    const u = quelle("components/speaker/PhotoUpload.tsx");
    assert.doesNotMatch(u, /toast\("error"/);
    assert.match(u, /role="alert"/);
  });

  it("der Text-Auszug findet jeden Schlüssel in DE und EN", () => {
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache).speaker;
      const auszug = fotoTexte(w);
      for (const k of FOTO_TEXTE) assert.notEqual(auszug[k], k, `${sprache}.speaker.${k} fehlt`);
    }
  });
});
