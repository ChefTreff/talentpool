import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { driveApi, DriveFehler, type OrdnerRechte } from "@/lib/drive/api";
import { DIENSTKONTO_VARIABLE, dienstkontoAus, type KontoStand } from "@/lib/drive/konto";
import {
  raeumeAuf,
  spiegeleAlle,
  spiegeleEinen,
  type SpiegelDeps,
  type SpiegelFehler,
  type SpiegelZeile,
  type Zusammenfassung,
} from "@/lib/drive/spiegel";
import { leereZaehler, type Uebersicht } from "@/lib/drive/anzeige";
import { uebersichtZeile, zielFuer, type Kandidat } from "@/lib/drive/ziel";

/**
 * Folien-Spiegelung in den Technik-Ordner (SPK-023) — die Verdrahtung mit
 * Umgebung, Datenbank und Bucket. **Alles hier läuft mit `service_role`; jeder
 * Aufrufer hat vorher die Rolle geprüft:** der Upload über
 * `register_speaker_asset` (Speaker selbst, Assistenz, Stage Lead, Team), der
 * Admin über `requireAdminSection("tech")`, der Cron über `CRON_SECRET`.
 *
 * Ohne `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` tut keine Funktion etwas: der Upload
 * gelingt wie bisher, der Admin zeigt „Dienstkonto fehlt“ (K-03).
 */

const BUCKET = "speaker-assets";
/** Höchstens so viele Übertragungen je Klick … */
const NACHHOLEN_MAX = 25;
/** … und nur so lange — die Seite erlaubt 300 s (`maxDuration`). */
const NACHHOLEN_MS = 240_000;

export function driveKonto(): KontoStand {
  return dienstkontoAus(process.env[DIENSTKONTO_VARIABLE]);
}

function abhaengigkeiten(admin: SupabaseClient, konto: Extract<KontoStand, { ok: true }>["konto"]) {
  const deps: SpiegelDeps & { fehlerMerken(id: string, fehler: SpiegelFehler, detail: string): Promise<void> } = {
    drive: driveApi(konto),
    async datei(pfad) {
      const { data, error } = await admin.storage.from(BUCKET).download(pfad);
      if (error || !data) throw new Error(error?.message ?? "Datei nicht im Bucket");
      return new Uint8Array(await data.arrayBuffer());
    },
    // Schreibfehler hier nur melden: die Datei trägt ihre Kennung in Drive, der
    // nächste Lauf findet sie im Tagesordner wieder statt eine zweite anzulegen.
    async speichern(zeile: SpiegelZeile) {
      const { error } = await admin.from("slide_drive_mirror").upsert(zeile, { onConflict: "profile_id,session_id" });
      if (error) console.error("[drive] Spiegelstand nicht gespeichert:", error.message);
    },
    async zeileEntfernen(id) {
      const { error } = await admin.from("slide_drive_mirror").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    async fehlerMerken(id, fehler, detail) {
      const { error } = await admin
        .from("slide_drive_mirror")
        .update({ status: "error", error_key: fehler, error_detail: detail.slice(0, 500), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) console.error("[drive] Fehler nicht gespeichert:", error.message);
    },
  };
  return deps;
}

async function kandidaten(admin: SupabaseClient, editionId: string | null, assetId: string | null): Promise<Kandidat[]> {
  const { data, error } = await admin.rpc("slide_mirror_candidates", { p_edition_id: editionId, p_asset_id: assetId });
  if (error) throw new Error(`slide_mirror_candidates: ${error.message}`);
  return (data ?? []) as Kandidat[];
}

/**
 * Nach dem Upload einer Präsentation (in `after()` der Server-Aktion): genau
 * diese Fassung spiegeln. Ist sie nicht mehr die aktuelle (zwei Uploads kurz
 * hintereinander), liefert die Datenbank nichts, und der zweite Upload
 * spiegelt die neuere.
 */
export async function spiegelePraesentation(assetId: string): Promise<void> {
  const stand = driveKonto();
  if (!stand.ok) return;
  try {
    const admin = createSupabaseAdminClient();
    const deps = abhaengigkeiten(admin, stand.konto);
    for (const k of await kandidaten(admin, null, assetId)) {
      const e = await spiegeleEinen(deps, k);
      if (!e.ok) console.error(`[drive] Spiegelung ${assetId}: ${e.fehler}`);
    }
  } catch (e) {
    console.error("[drive] Spiegelung nach dem Upload:", e instanceof Error ? e.message : e);
  }
}

/**
 * Nach dem Entfernen einer Präsentation (SPK-028): rückt die vorige Fassung
 * nach, ersetzt sie die Kopie in Drive; sonst verschwindet die Kopie.
 */
export async function spiegelNachLoeschen(assetId: string): Promise<void> {
  const stand = driveKonto();
  if (!stand.ok) return;
  try {
    const admin = createSupabaseAdminClient();
    const { data: zeile } = await admin
      .from("slide_drive_mirror")
      .select("id, profile_id, session_id, drive_file_id")
      .eq("asset_id", assetId)
      .maybeSingle();
    if (!zeile) return;
    const deps = abhaengigkeiten(admin, stand.konto);
    const nachfolger = (await kandidaten(admin, null, null)).find(
      (k) => k.profile_id === zeile.profile_id && k.session_id === zeile.session_id,
    );
    if (nachfolger && zielFuer(nachfolger)) {
      await spiegeleEinen(deps, nachfolger);
      return;
    }
    await raeumeAuf(deps, [{ mirror_id: zeile.id as string, drive_file_id: (zeile.drive_file_id as string | null) ?? null }]);
  } catch (e) {
    console.error("[drive] Spiegelung nach dem Löschen:", e instanceof Error ? e.message : e);
  }
}

export type NachholenErgebnis =
  | { ok: true; zusammenfassung: Zusammenfassung }
  | { ok: false; grund: "fehlt" | "ungueltig" | "fehler"; detail?: string };

/** Admin-Knopf „Spiegelung nachholen“: alles Offene der Edition, dann verwaiste Kopien. */
export async function spiegelNachholen(editionId: string, ausgeloestVon: string): Promise<NachholenErgebnis> {
  const stand = driveKonto();
  if (!stand.ok) return { ok: false, grund: stand.grund };
  const admin = createSupabaseAdminClient();
  const { data: jobId } = await admin.rpc("start_sync_job", {
    p_system: "google_drive",
    p_direction: "out",
    p_job_type: "slides_mirror",
    p_triggered_by: ausgeloestVon,
  });
  const job = (jobId as number | null) ?? null;
  try {
    const deps = abhaengigkeiten(admin, stand.konto);
    const z = await spiegeleAlle(deps, await kandidaten(admin, editionId, null), {
      max: NACHHOLEN_MAX,
      bisMs: Date.now() + NACHHOLEN_MS,
    });
    const { data: waisen } = await admin.rpc("slide_mirror_orphans", { p_limit: 50 });
    const weg = await raeumeAuf(deps, (waisen ?? []) as { mirror_id: string; drive_file_id: string | null }[]);
    z.entfernt = weg.entfernt;
    z.entfernenFehler = weg.fehler;
    if (job) {
      await admin.rpc("finish_sync_job", {
        p_id: job,
        p_status: z.fehler + z.entfernenFehler > 0 ? "partial" : "ok",
        p_stats: z,
        p_error: null,
      });
    }
    return { ok: true, zusammenfassung: z };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    if (job) await admin.rpc("finish_sync_job", { p_id: job, p_status: "failed", p_stats: {}, p_error: detail.slice(0, 500) });
    return { ok: false, grund: "fehler", detail: detail.slice(0, 300) };
  }
}

/**
 * Cron (`/api/cron/mail`): verwaiste Kopien entfernen — Folie gelöscht, Profil
 * gelöscht (`anonymize_person`), Session aus dem Slot. `null` ohne Dienstkonto.
 */
export async function driveAufraeumen(limit = 20): Promise<{ entfernt: number; fehler: number } | null> {
  const stand = driveKonto();
  if (!stand.ok) return null;
  const admin = createSupabaseAdminClient();
  const { data: waisen, error } = await admin.rpc("slide_mirror_orphans", { p_limit: limit });
  if (error) {
    console.error("[drive] slide_mirror_orphans:", error.message);
    return { entfernt: 0, fehler: 0 };
  }
  return raeumeAuf(abhaengigkeiten(admin, stand.konto), (waisen ?? []) as { mirror_id: string; drive_file_id: string | null }[]);
}

/** Daten der Admin-Karte. Aufrufer: `/admin/technik` nach `requireAdminSection("tech")`. */
export async function driveUebersicht(editionId: string | null): Promise<Uebersicht> {
  const stand = driveKonto();
  const leer: Uebersicht = {
    konto: stand.ok ? "bereit" : stand.grund,
    kontoAdresse: stand.ok ? stand.konto.clientEmail : null,
    ordnerId: null,
    zeilen: [],
    zaehler: leereZaehler(),
    verwaist: 0,
  };
  if (!editionId) return leer;
  const admin = createSupabaseAdminClient();
  const [{ data: einstellung }, liste, { data: waisen }] = await Promise.all([
    admin.from("slide_drive_setting").select("folder_id").eq("edition_id", editionId).maybeSingle(),
    kandidaten(admin, editionId, null).catch((e: unknown) => {
      console.error("[drive] Übersicht:", e instanceof Error ? e.message : e);
      return [] as Kandidat[];
    }),
    admin.rpc("slide_mirror_orphans", { p_limit: 500 }),
  ]);
  const zeilen = liste.map(uebersichtZeile);
  const zaehler = leereZaehler();
  for (const z of zeilen) zaehler[z.zustand] += 1;
  return {
    ...leer,
    ordnerId: (einstellung?.folder_id as string | undefined) ?? null,
    zeilen,
    zaehler,
    verwaist: ((waisen ?? []) as unknown[]).length,
  };
}

export type VerbindungsBericht =
  | { ok: true; rechte: OrdnerRechte }
  | { ok: false; grund: "fehlt" | "ungueltig" | "ohne_ordner" | SpiegelFehler; detail?: string };

/**
 * „Verbindung prüfen“: anmelden und den Zielordner lesen — nur lesend. Zeigt,
 * ob die Freigabe stimmt und ob das Konto verschieben und löschen darf
 * (Rolle „Inhaltsmanager“ in der geteilten Ablage, Runbook).
 */
export async function pruefeVerbindung(editionId: string): Promise<VerbindungsBericht> {
  const stand = driveKonto();
  if (!stand.ok) return { ok: false, grund: stand.grund };
  const admin = createSupabaseAdminClient();
  const { data: einstellung } = await admin
    .from("slide_drive_setting")
    .select("folder_id")
    .eq("edition_id", editionId)
    .maybeSingle();
  const ordner = (einstellung?.folder_id as string | undefined) ?? null;
  if (!ordner) return { ok: false, grund: "ohne_ordner" };
  try {
    return { ok: true, rechte: await driveApi(stand.konto).ordnerRechte(ordner) };
  } catch (e) {
    if (e instanceof DriveFehler) return { ok: false, grund: e.schluessel, detail: e.detail };
    return { ok: false, grund: "drive_error", detail: e instanceof Error ? e.message : String(e) };
  }
}
