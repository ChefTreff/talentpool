import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toRpcFailure } from "@/lib/rpc-error";
import { pruefeAbgabeDatei, speicherPfad, SUBMISSION_BUCKET } from "@/lib/hackathon/abgabe";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Dateien einer Hackathon-Abgabe (HACK-011) — nur Mitglieder des Teams.
 *
 * Zur Deadline laden ~300 Teams gleichzeitig hoch; die **Bytes gehen nie durch
 * diesen Server**: `?step=url` gibt einen signierten Platz heraus (eine kurze
 * Datenbankabfrage), der Browser lädt direkt zu Supabase, der zweite Aufruf
 * trägt die Datei über `register_hack_submission_file` ein.
 *
 * Der Bucket `hack-submissions` hat **keine Schreib-Policy**. Die Route prüft
 * `can_write_hack_submission` mit der Sitzung und signiert mit service_role
 * genau einen Pfad `<team_id>/<uuid>-<name>`, den sie selbst baut. Nach der
 * Frist geht das Hochladen weiter — die Datenbank markiert die Datei als
 * verspätet.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const teamId = String(body?.team_id ?? "");
  if (!body || !UUID.test(teamId)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const { data: darf, error: rechte } = await supabase.rpc("can_write_hack_submission", { p_team_id: teamId });
  if (rechte || !darf) return NextResponse.json({ error: "not_allowed" }, { status: 403 });

  if (new URL(request.url).searchParams.get("step") === "url") {
    const pruefung = pruefeAbgabeDatei({
      name: String(body.filename ?? ""),
      size: Number(body.size_bytes ?? 0),
      type: String(body.content_type ?? ""),
    });
    if (!pruefung.ok) {
      return NextResponse.json({ error: pruefung.key }, { status: pruefung.key === "too_large" ? 413 : 415 });
    }
    const path = speicherPfad(teamId, String(body.filename ?? ""), crypto.randomUUID());
    const { data, error } = await createSupabaseAdminClient().storage.from(SUBMISSION_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      console.error("[hack-submission] Upload-Adresse nicht erstellt:", error?.message);
      return NextResponse.json({ error: "upload_failed" }, { status: 500 });
    }
    return NextResponse.json({ path: data.path, token: data.token });
  }

  const path = String(body.path ?? "");
  if (!path.startsWith(`${teamId}/`) || path.split("/").length !== 2) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }
  const size = Number(body.size_bytes ?? 0);
  const { error } = await supabase.rpc("register_hack_submission_file", {
    p_team_id: teamId,
    p_storage_path: path,
    p_filename: String(body.filename ?? "") || "datei",
    p_mime: String(body.mime ?? "") || null,
    p_size_bytes: Number.isFinite(size) && size > 0 ? size : null,
  });
  if (error) {
    await createSupabaseAdminClient().storage.from(SUBMISSION_BUCKET).remove([path]);
    const f = toRpcFailure(error);
    return NextResponse.json({ error: f.key, detail: f.detail }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

/** Eine Datei entfernen: erst die Zeile (Recht + Audit in der Datenbank), dann das Objekt. */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: path, error } = await supabase.rpc("remove_hack_submission_file", { p_file_id: id });
  if (error) {
    const f = toRpcFailure(error);
    return NextResponse.json({ error: f.key }, { status: f.key === "not_allowed" ? 403 : 400 });
  }
  if (typeof path === "string" && path) {
    await createSupabaseAdminClient().storage.from(SUBMISSION_BUCKET).remove([path]);
  }
  return NextResponse.json({ ok: true });
}
