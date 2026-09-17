import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

export const dynamic = "force-dynamic";

const BUCKET = "session-assets";
const MAX_BYTES = 25 * 1024 * 1024;
const ERLAUBT = new Set(["image/jpeg", "image/png", "image/webp"]);
const ARTEN = new Set(["stage_photo", "slot_graphic"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bilder am Auftritt hochladen.
 *
 * Die Reihenfolge ist Absicht: erst Form und Typ prüfen, **dann** in den
 * Bucket, dann die Zeile über `register_session_asset`. Andersherum läge bei
 * jedem abgelehnten Aufruf eine Datei im Bucket, die niemand mehr wegräumt
 * (dieselbe Lehre wie bei den Editionsdateien, Review 15.09.).
 *
 * Geschrieben wird mit dem **Session-Client**, nicht mit `service_role`: die
 * Bucket-Policy prüft `is_marketing_team()` selbst, und die RPC ein zweites
 * Mal. Zwei Grenzen, die dasselbe sagen, sind hier billig zu haben.
 */
export async function POST(request: Request) {
  await requireArea("admin", "/admin/grafiken");
  const supabase = await createSupabaseServerClient();

  const form = await request.formData();
  const file = form.get("file");
  const sessionId = String(form.get("session_id") ?? "");
  const kind = String(form.get("kind") ?? "");
  const cutout = String(form.get("cutout") ?? "") === "true";
  const credit = String(form.get("credit") ?? "").trim();

  if (!(file instanceof File) || !UUID.test(sessionId) || !ARTEN.has(kind)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  if (!ERLAUBT.has(file.type)) {
    return NextResponse.json({ error: "wrong_type", detail: file.type }, { status: 415 });
  }

  // Dateiname entschärfen: der Pfad ist ein Schlüssel, kein Anzeigetext.
  const sauber = file.name.replace(/[^\w.\-]+/g, "-").slice(-80) || "bild";
  const path = `${sessionId}/${kind}/${Date.now()}-${sauber}`;

  const { error: uploadFehler } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadFehler) {
    console.error("[session-assets] upload:", uploadFehler.message);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  const { data, error } = await supabase.rpc("register_session_asset", {
    p_data: {
      session_id: sessionId,
      kind,
      storage_path: path,
      filename: file.name,
      mime: file.type,
      size_bytes: file.size,
      cutout,
      ...(credit ? { credit } : {}),
    },
  });
  if (error) {
    // Die Zeile fehlt, also gehört die Datei auch nicht dorthin.
    await supabase.storage.from(BUCKET).remove([path]);
    const f = toRpcFailure(error);
    return NextResponse.json({ error: f.key, detail: f.detail }, { status: 403 });
  }
  return NextResponse.json({ id: data as string, path });
}

/** Hart löschen — die RPC lässt nur Admin durch und gibt den Pfad zurück. */
export async function DELETE(request: Request) {
  await requireArea("admin", "/admin/grafiken");
  const supabase = await createSupabaseServerClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const { data, error } = await supabase.rpc("delete_session_asset", { p_id: id });
  if (error) {
    const f = toRpcFailure(error);
    return NextResponse.json({ error: f.key }, { status: 403 });
  }
  if (typeof data === "string" && data !== "") {
    const { error: wegFehler } = await supabase.storage.from(BUCKET).remove([data]);
    // Die Zeile ist weg; eine verwaiste Datei ist ärgerlich, aber kein Fehler
    // für den Aufrufer — sie steht im Log.
    if (wegFehler) console.error("[session-assets] remove:", wegFehler.message);
  }
  return NextResponse.json({ ok: true });
}
