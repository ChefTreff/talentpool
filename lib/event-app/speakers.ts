import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { importSpeakers, speakerGroupId } from "@/lib/event-app/swapcard/adapter";
import { ensurePublicPhoto, publicPhotoUrl } from "@/lib/event-app/logos";

/** Zeile aus `event_app_speakers()` (0136). */
export type SpeakerRow = {
  profile_id: string;
  person_id: string;
  edition_slug: string;
  swapcard_event_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
  organization: string | null;
  bio_short_de: string | null;
  bio_short_en: string | null;
  website: string | null;
  photo_path: string | null;
  photo_asset_id: string | null;
  photo_mime: string | null;
  has_photo: boolean;
  pipeline_status: string | null;
  swapcard_person_id: string | null;
};

export type SpeakerSummary = {
  dryRun: boolean;
  eventId: string | null;
  rows: number;
  /** Übertragbar — alles, was Vor- und Nachnamen hat. */
  eligible: number;
  create: number;
  update: number;
  errors: number;
  refs: number;
  /** Mit Foto in der App. */
  mitFoto: number;
  /** Zurückgehalten, mit Grund. Wer fehlt, steht namentlich da, statt still zu verschwinden. */
  zurueckgehalten: { name: string; grund: "kein_name" }[];
  /** Ohne Profilfoto — in der App bleibt der Platzhalter. */
  ohneFoto: string[];
  runs: { name: string; outcome: string; detail?: string }[];
  skipped?: string;
};

const name = (r: SpeakerRow) => `${(r.first_name ?? "").trim()} ${(r.last_name ?? "").trim()}`.trim();

/**
 * Bestätigte Speaker als Personen mit Speaker-Pass nach Swapcard (EA2).
 *
 * **Die Zusage ist die Grundlage, keine eigene Einwilligung.** Konrad, 22.09.2026:
 * das Profil in der Event-App wird mit der Zusage gegeben, also geht jedes
 * bestätigte Profil hinaus. Zurückgehalten wird nur, wer keinen vollständigen
 * Namen hat — und der steht namentlich in `zurueckgehalten`, statt still zu
 * verschwinden. (Für Teilnehmende gilt das nicht: dort bleibt die Einwilligung
 * „Weitergabe an die Event-App" Bedingung, siehe EA4.)
 *
 * Idempotent über `clientId` = unsere Personen-Kennung: Swapcard führt sie am
 * Datensatz, `importEventPeople` erkennt daran, ob es anlegt oder ändert. Die
 * zurückgegebene Kennung landet zusätzlich in `external_ref` (`person`), damit
 * ein späterer Lauf ohne Swapcard-Abfrage weiss, wen er schon kennt.
 *
 * Der Pass-Typ ist `speaker-pass` (Wert aus `event.speakersTypes`, geprüft am
 * 22.09.2026); die Gruppe ist „Speakers". Im Trockenlauf gibt Swapcard — wie beim
 * Ausstellerlauf — nur Beanstandungen zurück, keine Kennungen: „keine Fehler"
 * heisst „alles gültig". **Kein Foto**: `speaker_asset` liegt im
 * privaten Bucket, und ob Personenfotos eine öffentliche Kopie bekommen wie die
 * Partnerlogos, ist eine Datenschutzentscheidung — offen, siehe Migrationskopf.
 */
export async function syncSpeakers(opts: {
  admin: SupabaseClient;
  editionId?: string | null;
  dryRun: boolean;
  hatSchluessel: boolean;
}): Promise<SpeakerSummary> {
  const { admin, dryRun } = opts;
  const out: SpeakerSummary = {
    dryRun, eventId: null, rows: 0, eligible: 0, create: 0, update: 0, errors: 0, refs: 0, mitFoto: 0,
    zurueckgehalten: [], ohneFoto: [], runs: [],
  };

  const { data, error } = await admin.rpc("event_app_speakers", { p_edition_id: opts.editionId ?? null });
  if (error) throw new Error(`event_app_speakers: ${error.message}`);
  const rows = (data ?? []) as SpeakerRow[];
  out.rows = rows.length;
  if (rows.length === 0) return out;
  if (!opts.hatSchluessel) return { ...out, skipped: "SWAPCARD_API_KEY fehlt – nichts übertragen" };

  const eventId = rows.find((r) => r.swapcard_event_id)?.swapcard_event_id ?? null;
  out.eventId = eventId;
  if (!eventId) return { ...out, skipped: "Edition ohne swapcard_event_id (set_edition_swapcard)" };

  const gehen: SpeakerRow[] = [];
  for (const r of rows) {
    // Swapcard verlangt Vor- **und** Nachnamen. Eine Person ohne beides würde
    // drüben als Fehler zurückkommen; hier steht sie mit Grund in der Liste.
    if (!(r.first_name ?? "").trim() || !(r.last_name ?? "").trim()) {
      out.zurueckgehalten.push({ name: name(r) || r.person_id, grund: "kein_name" });
      continue;
    }
    gehen.push(r);
    if (r.has_photo) out.mitFoto += 1;
    else out.ohneFoto.push(name(r));
  }
  out.eligible = gehen.length;
  if (gehen.length === 0) return out;

  const gruppe = await speakerGroupId(eventId);

  // Im Echtlauf zuerst die öffentliche Kopie anlegen, dann schicken — sonst
  // zeigte die App auf eine Adresse, unter der noch nichts liegt. Im Trockenlauf
  // zählt die Adresse, unter der sie liegen wird.
  const fotoUrl = new Map<string, string>();
  for (const r of gehen) {
    if (!r.has_photo) continue;
    try {
      const url = dryRun ? publicPhotoUrl(admin, r) : await ensurePublicPhoto(admin, r);
      if (url) fotoUrl.set(r.person_id, url);
    } catch (e) {
      out.errors += 1;
      out.runs.push({ name: name(r), outcome: "foto_fehler", detail: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
    }
  }

  const eintraege = gehen.map((r) => {
    const felder = {
      firstName: (r.first_name ?? "").trim(),
      lastName: (r.last_name ?? "").trim(),
      jobTitle: r.job_title?.trim() || undefined,
      organization: r.organization?.trim() || undefined,
      biography: r.bio_short_de?.trim() || r.bio_short_en?.trim() || undefined,
      websiteUrl: r.website?.trim() || undefined,
      email: r.email ?? undefined,
      photoUrl: fotoUrl.get(r.person_id),
      type: "speaker-pass",
      isVisible: true,
    };
    return {
      clientId: r.person_id,
      inputId: r.person_id,
      // `create` und `update` mit demselben Inhalt: Swapcard entscheidet über die
      // `clientId`, welchen Zweig es nimmt. `isUser` gehört nur in `create`.
      create: { ...felder, isUser: false },
      update: felder,
      // `updateGroups` verlangt `action` **und** `groupIds`; die naheliegende
      // Form `{ add: [...] }` weist Swapcard ab (geprüft 22.09.2026).
      actions: gruppe ? { updateGroups: { action: "ADD", groupIds: [gruppe] } } : undefined,
    };
  });

  const ergebnis = await importSpeakers(eventId, eintraege, dryRun);
  for (const f of ergebnis.errors) {
    const r = gehen.find((x) => x.person_id === f.inputId);
    out.errors += 1;
    out.runs.push({ name: r ? name(r) : f.inputId, outcome: dryRun ? "invalid" : "error", detail: `${f.code}: ${f.message}`.slice(0, 300) });
  }
  const fehlerhaft = new Set(ergebnis.errors.map((f) => f.inputId));

  for (const r of gehen) {
    if (fehlerhaft.has(r.person_id)) continue;
    const drueben = ergebnis.ids.get(r.person_id) ?? null;
    const art = r.swapcard_person_id || ergebnis.updated.has(r.person_id) ? "update" : "create";
    out[art] += 1;
    out.runs.push({ name: name(r), outcome: `${dryRun ? "would_" : ""}${art}`, detail: drueben ?? undefined });
    if (dryRun || !drueben || drueben === r.swapcard_person_id) continue;
    const { error: refFehler } = await admin.rpc("set_event_app_person_ref", {
      p_person_id: r.person_id,
      p_system: "swapcard",
      p_external_id: drueben,
      p_meta: { role: "speaker", edition: r.edition_slug, synced_at: new Date().toISOString() },
    });
    if (refFehler) {
      out.errors += 1;
      out.runs.push({ name: name(r), outcome: "ref_error", detail: refFehler.message.slice(0, 200) });
    } else out.refs += 1;
  }
  return out;
}
