import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verkleinere } from "@/lib/edition-files/verkleinern.mjs";
import { hasSanityConfig, SanityError, sanityMutate, sanityUploadImage } from "@/lib/sanity/client";
import {
  personenAus,
  speakerDocId,
  speakerFelder,
  speakerMutationen,
  speakerPlan,
  SPEAKER_REF_TYPE,
  type Grund,
  type PlanEintrag,
  type SpeakerRef,
  type SpeakerRefMeta,
  type SpeakerZeile,
} from "@/lib/sanity/speaker-mapping";

/**
 * Speaker für die Website (SPK-046): Vorschau, Echtlauf und der Weg hinaus.
 *
 * **Anlegen und Ändern nur per Admin-Knopf** (`/admin/speaker/website`), und der Echtlauf nur mit
 * `SANITY_SPEAKERS_WRITE_ENABLED=true` — Konrad setzt den Schalter erst nach der Freigabe durch das
 * Website-Team (Patrick, Juliane). Die Vorschau schreibt nie: Sanity prüft die Mutationen mit `dryRun`.
 *
 * **Entfernen** geht auch ohne Schalter und läuft zusätzlich im Cron (`speakerRuecknahme`): Widerruf,
 * Absage, Entzug der Freigabe oder Löschung der Person nehmen das Dokument und sein Foto aus Sanity
 * (Entscheidungslog 24.09., „Weg hinaus automatisch“). Es betrifft nur Dokumente, die das Portal angelegt
 * hat — sie stehen in `external_ref`.
 *
 * Alles hier läuft mit `service_role`; die Route prüft vorher `requireAdminSection("speakers")` und das
 * Speaker-Team, der Cron `CRON_SECRET`.
 */
export const SCHREIBEN_VARIABLE = "SANITY_SPEAKERS_WRITE_ENABLED";
const SYSTEM = "sanity";
const BUCKET = "speaker-assets";
/** So viele Dokumente prüft eine Vorschau bei Sanity; mehr zählen nur. */
const PRUEF_GRENZE = 60;

export function speakerSchreibenErlaubt(): boolean {
  return process.env[SCHREIBEN_VARIABLE]?.trim() === "true";
}

export type SpeakerLauf = {
  dryRun: boolean;
  konfiguriert: boolean;
  schreibenErlaubt: boolean;
  personen: number;
  anlegen: { name: string; docId: string; fotoNeu: boolean }[];
  aendern: { name: string; docId: string; geaendert: string[] }[];
  unveraendert: number;
  entfernen: { name: string | null; docId: string; gruende: Grund[] }[];
  zurueckgehalten: { name: string; gruende: Grund[] }[];
  /** Vorschau: von Sanity geprüft (`dryRun`). */
  geprueft: number;
  /**
   * Vorschau ohne Sanity-Prüfung: auch `dryRun` verlangt Schreibrecht, und bis zur Freigabe durch das
   * Web-Team hat der Token nur Leserechte (Befund 02.10.2026: 403 „permission create required“). Die Liste
   * gilt trotzdem; sie kommt aus der Datenbank.
   */
  pruefung?: "token_read_only";
  /** Echtlauf: geschrieben bzw. entfernt. */
  geschrieben: number;
  entfernt: number;
  fehler: { name: string; detail: string }[];
  skipped?: string;
};

async function lade(admin: SupabaseClient): Promise<{ zeilen: SpeakerZeile[]; refs: SpeakerRef[] }> {
  const [{ data: zeilen, error }, { data: refs, error: refErr }] = await Promise.all([
    admin.rpc("sanity_speakers", { p_edition_id: null }),
    admin.rpc("list_external_refs", { p_system: SYSTEM, p_object_type: SPEAKER_REF_TYPE }),
  ]);
  if (error) throw new Error(`sanity_speakers: ${error.message}`);
  if (refErr) throw new Error(`list_external_refs: ${refErr.message}`);
  return { zeilen: (zeilen ?? []) as SpeakerZeile[], refs: (refs ?? []) as SpeakerRef[] };
}

const meldung = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/** Foto aus dem privaten Bucket, gedreht, verkleinert, ohne Metadaten (wie ADM-042), als Sanity-Bild. */
async function fotoHochladen(admin: SupabaseClient, e: PlanEintrag): Promise<string> {
  const pfad = e.person.quelle.photo_path;
  if (!pfad) throw new Error("kein Foto");
  const { data, error } = await admin.storage.from(BUCKET).download(pfad);
  if (error || !data) throw new Error(`Foto laden: ${error?.message ?? "leer"}`);
  const { buffer } = await verkleinere(new Uint8Array(await data.arrayBuffer()));
  const asset = await sanityUploadImage(new Blob([new Uint8Array(buffer)], { type: "image/webp" }), `${speakerDocId(e.person.personId)}.webp`, "image/webp");
  // `sanityUploadImage` weicht bei Ablehnung auf ein Datei-Asset aus; als Porträt taugt nur ein Bild.
  if (!asset._id.startsWith("image-")) throw new Error("Foto wurde nicht als Bild angenommen");
  return asset._id;
}

/** Dokument und Foto aus Sanity nehmen, dann die Merkzeile. Ein schon fehlendes Dokument zählt als entfernt. */
async function entferne(admin: SupabaseClient, eintrag: { personId: string; docId: string; sanityAssetId: string | null }): Promise<void> {
  await sanityMutate([{ delete: { id: eintrag.docId } }]);
  if (eintrag.sanityAssetId) {
    // Erst nach dem Dokument: solange es auf das Bild zeigt, lehnt Sanity das Löschen ab.
    await sanityMutate([{ delete: { id: eintrag.sanityAssetId } }]).catch((e: unknown) =>
      console.error("[sanity/speaker] Foto nicht entfernt:", meldung(e)),
    );
  }
  const { error } = await admin.rpc("delete_external_ref", { p_system: SYSTEM, p_object_type: SPEAKER_REF_TYPE, p_object_id: eintrag.personId });
  if (error) throw new Error(`delete_external_ref: ${error.message}`);
}

export async function speakerLauf(opts: { admin: SupabaseClient; dryRun: boolean }): Promise<SpeakerLauf> {
  const { admin, dryRun } = opts;
  const { zeilen, refs } = await lade(admin);
  const personen = personenAus(zeilen);
  const plan = speakerPlan(personen, refs);
  const lauf: SpeakerLauf = {
    dryRun,
    konfiguriert: hasSanityConfig(),
    schreibenErlaubt: speakerSchreibenErlaubt(),
    personen: personen.length,
    anlegen: plan.uebertragen.filter((e) => e.art === "anlegen").map((e) => ({ name: e.person.name, docId: speakerDocId(e.person.personId), fotoNeu: e.fotoNeu })),
    aendern: plan.uebertragen.filter((e) => e.art === "aendern").map((e) => ({ name: e.person.name, docId: speakerDocId(e.person.personId), geaendert: e.geaendert })),
    unveraendert: plan.unveraendert.length,
    entfernen: plan.entfernen.map((e) => ({ name: e.name, docId: e.docId, gruende: e.gruende })),
    zurueckgehalten: plan.zurueckgehalten.map((p) => ({ name: p.name, gruende: p.gruende })),
    geprueft: 0,
    geschrieben: 0,
    entfernt: 0,
    fehler: [],
  };
  if (!lauf.konfiguriert) return { ...lauf, skipped: "sanity_missing" };
  const jetzt = new Date().toISOString();

  if (dryRun) {
    for (const e of plan.uebertragen.slice(0, PRUEF_GRENZE)) {
      // Das Foto lädt erst der Echtlauf hoch; geprüft wird das Dokument mit dem Bild, das schon in Sanity liegt.
      const bild = e.fotoNeu ? null : (e.ref?.meta?.sanity_asset_id ?? null);
      try {
        await sanityMutate(speakerMutationen(speakerDocId(e.person.personId), speakerFelder(e.person, bild), jetzt), { dryRun: true });
        lauf.geprueft += 1;
      } catch (err) {
        // Einmal vermerken statt bei jeder Person denselben Rechtefehler zu zeigen.
        if (err instanceof SanityError && err.status === 403) {
          lauf.pruefung = "token_read_only";
          break;
        }
        lauf.fehler.push({ name: e.person.name, detail: meldung(err) });
      }
    }
    return lauf;
  }

  // Echtlauf. Entfernen zuerst und immer — es ist der Weg hinaus, kein Veröffentlichen.
  for (const e of plan.entfernen) {
    try {
      await entferne(admin, e);
      lauf.entfernt += 1;
    } catch (err) {
      lauf.fehler.push({ name: e.name ?? e.docId, detail: meldung(err) });
    }
  }
  if (!lauf.schreibenErlaubt) return { ...lauf, skipped: "write_disabled" };

  for (const e of plan.uebertragen) {
    const docId = speakerDocId(e.person.personId);
    const alt = e.ref?.meta?.sanity_asset_id ?? null;
    try {
      const bild = e.person.quelle.photo_path ? (e.fotoNeu || !alt ? await fotoHochladen(admin, e) : alt) : null;
      await sanityMutate(speakerMutationen(docId, speakerFelder(e.person, bild), jetzt));
      const meta: SpeakerRefMeta = {
        fassung: e.fassung,
        teile: e.teile,
        photo_asset_id: e.person.quelle.photo_asset_id,
        sanity_asset_id: bild,
        editions: e.person.editionen,
        published_at: jetzt,
      };
      const { error } = await admin.rpc("set_external_ref", {
        p_system: SYSTEM,
        p_object_type: SPEAKER_REF_TYPE,
        p_object_id: e.person.personId,
        p_external_id: docId,
        p_meta: meta,
      });
      if (error) throw new Error(`set_external_ref: ${error.message}`);
      lauf.geschrieben += 1;
      // Das alte Foto geht mit, sobald es nicht mehr gebraucht wird — ein ersetztes Porträt bleibt nicht liegen.
      if (alt && alt !== bild) {
        await sanityMutate([{ delete: { id: alt } }]).catch((err: unknown) => console.error("[sanity/speaker] altes Foto:", meldung(err)));
      }
    } catch (err) {
      lauf.fehler.push({ name: e.person.name, detail: meldung(err) });
    }
  }
  return lauf;
}

/**
 * Cron (`/api/cron/mail`): der Weg hinaus ohne Knopf. Ruft Sanity nur, wenn wirklich ein Dokument weg muss;
 * ohne Merkzeilen (noch nie veröffentlicht) passiert nichts. `null` ohne Sanity-Konfiguration.
 */
export async function speakerRuecknahme(admin: SupabaseClient): Promise<{ entfernt: number; fehler: number } | null> {
  if (!hasSanityConfig()) return null;
  const { data: refs, error } = await admin.rpc("list_external_refs", { p_system: SYSTEM, p_object_type: SPEAKER_REF_TYPE });
  if (error) {
    console.error("[sanity/speaker] list_external_refs:", error.message);
    return { entfernt: 0, fehler: 0 };
  }
  if (!refs?.length) return { entfernt: 0, fehler: 0 };
  const { zeilen } = await lade(admin);
  const plan = speakerPlan(personenAus(zeilen), refs as SpeakerRef[]);
  let entfernt = 0;
  let fehler = 0;
  for (const e of plan.entfernen) {
    try {
      await entferne(admin, e);
      entfernt += 1;
    } catch (err) {
      fehler += 1;
      console.error(`[sanity/speaker] ${e.docId}:`, meldung(err));
    }
  }
  return { entfernt, fehler };
}
