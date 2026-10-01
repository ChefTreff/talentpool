import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toRpcFailure } from "@/lib/rpc-error";
import { DATASET_BUCKET, datasetPfad, pruefeDatensatz } from "@/lib/hackathon/datensatz";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Datensatz einer Hackathon-Challenge hochladen (HACK-012) — für Partner der
 * Challenge und das Hack-Team.
 *
 * Zwei Schritte **ohne Bytes durch den Server** (Muster Media Kit):
 * `?step=url` gibt einen signierten Platz heraus, der Browser lädt direkt zu
 * Supabase, der zweite Aufruf trägt die Datei über `register_hack_dataset` ein.
 *
 * Der Bucket `hack-datasets` hat **keine Schreib-Policy**. Die Route prüft
 * `can_manage_hack_dataset` mit der Sitzung der Person und signiert mit
 * service_role genau einen Pfad `<challenge_id>/<uuid>-<name>`, den sie selbst
 * baut. `register_hack_dataset` prüft Recht, Pfad und Objekt ein zweites Mal.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const challengeId = String(body?.challenge_id ?? "");
  if (!body || !UUID.test(challengeId)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const { data: darf, error: rechte } = await supabase.rpc("can_manage_hack_dataset", { p_challenge_id: challengeId });
  if (rechte || !darf) return NextResponse.json({ error: "not_allowed" }, { status: 403 });

  if (new URL(request.url).searchParams.get("step") === "url") {
    const pruefung = pruefeDatensatz({
      name: String(body.filename ?? ""),
      size: Number(body.size_bytes ?? 0),
      type: String(body.content_type ?? ""),
    });
    if (!pruefung.ok) {
      return NextResponse.json({ error: pruefung.key }, { status: pruefung.key === "too_large" ? 413 : 415 });
    }
    const path = datasetPfad(challengeId, String(body.filename ?? ""), crypto.randomUUID());
    const { data, error } = await createSupabaseAdminClient().storage.from(DATASET_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      console.error("[hack-dataset] Upload-Adresse nicht erstellt:", error?.message);
      return NextResponse.json({ error: "upload_failed" }, { status: 500 });
    }
    return NextResponse.json({ path: data.path, token: data.token });
  }

  const path = String(body.path ?? "");
  if (!path.startsWith(`${challengeId}/`) || path.split("/").length !== 2) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }
  const size = Number(body.size_bytes ?? 0);
  // Über die Sitzung, nicht den Admin-Client: `uploaded_by` und Audit nennen die Person.
  const { error } = await supabase.rpc("register_hack_dataset", {
    p_challenge_id: challengeId,
    p_storage_path: path,
    p_filename: String(body.filename ?? "") || "dataset",
    p_mime: String(body.mime ?? "") || null,
    p_size_bytes: Number.isFinite(size) && size > 0 ? size : null,
  });
  if (error) {
    // Ohne Eintrag darf die Datei nicht liegen bleiben.
    await createSupabaseAdminClient().storage.from(DATASET_BUCKET).remove([path]);
    const f = toRpcFailure(error);
    return NextResponse.json({ error: f.key, detail: f.detail }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
