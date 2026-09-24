import { NextResponse } from "next/server";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

export const dynamic = "force-dynamic";

const BUCKET = "session-assets";
/** Wie der Bucket selbst: 25 MB (`20260917185916_v6_session_grafiken`). */
const MAX_BYTES = 25 * 1024 * 1024;
const ERLAUBT = new Set(["image/jpeg", "image/png", "image/webp"]);
const ARTEN = new Set(["stage_photo", "slot_graphic"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bilder am Auftritt hochladen — **in zwei Schritten, ohne Bytes durch den
 * Server** (Befund Konrad, 21.09.2026).
 *
 * Vorher nahm diese Route die Datei selbst entgegen. Das las sich gut und ging
 * lokal auch: die Route erlaubte 25 MB, so viel wie der Bucket. Nur hält die
 * Plattform Funktionsrümpfe bei gut 4 MB an — und zwar mit einer HTML-Seite,
 * bevor eine Zeile dieser Datei läuft. Dieselbe Lehre wie beim Kontaktfoto am
 * 18.09.: **die Oberfläche darf nichts versprechen, was nicht uns gehört.**
 *
 * Jetzt gibt `?step=url` nur einen signierten Platz im Bucket heraus, die
 * Bytes gehen vom Browser direkt zu Supabase, und der zweite Aufruf legt die
 * Zeile an. Beides sind kleine JSON-Anfragen, die keine Grössengrenze
 * berühren.
 *
 * **Den Pfad bestimmt der Server**, nicht der Browser — sonst schriebe jemand
 * aus seinem Ordner hinaus. Zusätzlich prüfen ihn die Bucket-Policy
 * (`session_asset_path_allowed(name, true)`) und `register_session_asset` noch
 * einmal; beide verlangen ausserdem `is_marketing_team()`.
 *
 * Signiert wird mit dem **Session-Client**, nicht mit `service_role`: so
 * entscheidet weiterhin die Bucket-Policy, wer schreiben darf. Ein signierter
 * Platz aus dem Admin-Client ginge an ihr vorbei, und die Prüfung müsste hier
 * im Code noch einmal nachgebaut werden.
 */
export async function POST(request: Request) {
  await requireAdminSection("graphics", "/admin/grafiken");
  const supabase = await createSupabaseServerClient();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const sessionId = String(body.session_id ?? "");
  const kind = String(body.kind ?? "");
  if (!UUID.test(sessionId) || !ARTEN.has(kind)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const schritt = new URL(request.url).searchParams.get("step");
  return schritt === "url"
    ? platzGeben(supabase, body, sessionId, kind)
    : eintragen(supabase, body, sessionId, kind);
}

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Schritt 1: einen signierten Platz im Bucket herausgeben. */
async function platzGeben(
  supabase: Client,
  body: Record<string, unknown>,
  sessionId: string,
  kind: string,
) {
  const contentType = String(body.content_type ?? "");
  if (!ERLAUBT.has(contentType)) {
    return NextResponse.json({ error: "wrong_type", detail: contentType }, { status: 415 });
  }
  const size = Number(body.size_bytes ?? 0);
  // Die Grenze zählt am Bucket; hier steht sie nur, damit die Absage kommt,
  // bevor jemand minutenlang hochlädt.
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  // Dateiname entschärfen: der Pfad ist ein Schlüssel, kein Anzeigetext.
  const sauber = String(body.filename ?? "").replace(/[^\w.\-]+/g, "-").slice(-80) || "bild";
  const path = `${sessionId}/${kind}/${Date.now()}-${sauber}`;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    // Die Policy sagt Nein, oder der Storage ist nicht erreichbar. Beides
    // gehört ins Log, keins davon in die Antwort.
    console.error("[session-assets] Upload-Adresse nicht erstellt:", error?.message);
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }
  return NextResponse.json({ path: data.path, token: data.token });
}

/** Schritt 2: die Zeile anlegen — und aufräumen, wenn das scheitert. */
async function eintragen(
  supabase: Client,
  body: Record<string, unknown>,
  sessionId: string,
  kind: string,
) {
  const path = String(body.path ?? "");
  const mime = String(body.mime ?? "");
  const size = Number(body.size_bytes ?? 0);
  const credit = String(body.credit ?? "").trim();
  const cutout = body.cutout === true;

  // Derselbe Zuschnitt, den die Datenbank gleich noch einmal prüft. Hier
  // abzulehnen ist billiger und sagt dem Aufrufer dasselbe.
  if (!path.startsWith(`${sessionId}/${kind}/`) || path.split("/").length !== 3) {
    return NextResponse.json({ error: "invalid_path", detail: path }, { status: 400 });
  }
  if (!ERLAUBT.has(mime)) {
    return NextResponse.json({ error: "wrong_type", detail: mime }, { status: 415 });
  }

  const { data, error } = await supabase.rpc("register_session_asset", {
    p_data: {
      session_id: sessionId,
      kind,
      storage_path: path,
      filename: String(body.filename ?? "") || "bild",
      mime,
      size_bytes: Number.isFinite(size) && size > 0 ? size : null,
      cutout,
      ...(credit ? { credit } : {}),
    },
  });
  if (error) {
    // Die Zeile fehlt, also gehört die Datei auch nicht dorthin. Das Aufräumen
    // liegt bewusst hier und nicht im Browser: ein geschlossener Tab liesse
    // sonst eine Datei zurück, die niemand mehr findet.
    await supabase.storage.from(BUCKET).remove([path]);
    const f = toRpcFailure(error);
    return NextResponse.json({ error: f.key, detail: f.detail }, { status: 403 });
  }
  return NextResponse.json({ id: data as string, path });
}

/** Hart löschen — die RPC lässt nur Admin durch und gibt den Pfad zurück. */
export async function DELETE(request: Request) {
  await requireAdminSection("graphics", "/admin/grafiken");
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
