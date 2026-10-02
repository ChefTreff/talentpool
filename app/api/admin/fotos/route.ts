import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toRpcFailure } from "@/lib/rpc-error";
import { speicherPfad } from "@/lib/hackathon/datensatz";
import { PHOTO_BUCKET, pruefeFoto } from "@/lib/fotos/regeln";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Event-Fotos hochladen und löschen (TAL-010) — Abschnitt `photos`.
 *
 * Zwei Schritte **ohne Bytes durch den Server** (Muster Media Kit): `?step=url`
 * gibt einen signierten Platz heraus, der Browser lädt direkt zu Supabase, der
 * zweite Aufruf trägt das Foto über `register_event_photo` ein (unveröffentlicht).
 * Der Bucket `event-photos` hat **keine Schreib-Policy**; die Route prüft
 * `can_manage_event_photos` mit der Sitzung und signiert genau einen Pfad
 * `<event_id>/<uuid>-<name>`, den sie selbst baut.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: darf } = await supabase.rpc("can_manage_event_photos");
  if (!darf) return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const eventId = String(body?.event_id ?? "");
  if (!body || !UUID.test(eventId)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  if (new URL(request.url).searchParams.get("step") === "url") {
    const pruefung = pruefeFoto({ size: Number(body.size_bytes ?? 0), type: String(body.content_type ?? "") });
    if (!pruefung.ok) return NextResponse.json({ error: pruefung.key }, { status: pruefung.key === "too_large" ? 413 : 415 });
    const path = speicherPfad(eventId, String(body.filename ?? ""), crypto.randomUUID(), "foto");
    const { data, error } = await createSupabaseAdminClient().storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      console.error("[event-photos] Upload-Adresse nicht erstellt:", error?.message);
      return NextResponse.json({ error: "upload_failed" }, { status: 500 });
    }
    return NextResponse.json({ path: data.path, token: data.token });
  }

  const path = String(body.path ?? "");
  if (!path.startsWith(`${eventId}/`) || path.split("/").length !== 2) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }
  const { error } = await supabase.rpc("register_event_photo", {
    p_event_id: eventId,
    p_storage_path: path,
    p_filename: String(body.filename ?? "") || "foto",
    p_credit: String(body.credit ?? "") || null,
  });
  if (error) {
    await createSupabaseAdminClient().storage.from(PHOTO_BUCKET).remove([path]);
    const f = toRpcFailure(error);
    return NextResponse.json({ error: f.key, detail: f.detail }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

/** Foto löschen: erst die Zeile (Recht + Audit in der Datenbank), dann das Objekt. */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: path, error } = await supabase.rpc("delete_event_photo", { p_photo_id: id });
  if (error) {
    const f = toRpcFailure(error);
    return NextResponse.json({ error: f.key }, { status: f.key === "not_allowed" ? 403 : 400 });
  }
  if (typeof path === "string" && path) await createSupabaseAdminClient().storage.from(PHOTO_BUCKET).remove([path]);
  return NextResponse.json({ ok: true });
}
