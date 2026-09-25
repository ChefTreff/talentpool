import { NextResponse } from "next/server";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toRpcFailure } from "@/lib/rpc-error";

export const dynamic = "force-dynamic";

/** Dieselbe Ablage wie Hallenplan und Anfahrt: Dateien der Edition, Art `media_kit`. */
const BUCKET = "edition-files";
const ART = "media_kit";
/** Wie der Bucket: 25 MB. */
const MAX_BYTES = 25 * 1024 * 1024;
/** Wie der Bucket seit `v6_media_kit`: PDF, Bilder und ZIP-Pakete. */
const ERLAUBT = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/svg+xml", "application/zip"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Dateien des Media Kits hochladen und entfernen (PART-041, ADM-023) — für das
 * Marketing unter `/admin/grafiken`.
 *
 * Wie bei den Editionsdateien der Produktion in **zwei Schritten ohne Bytes
 * durch den Server**: `?step=url` gibt einen signierten Platz heraus, der
 * Browser lädt direkt zu Supabase, der zweite Aufruf legt den Eintrag an.
 *
 * Der Bucket hat **keine Schreib-Policy** für angemeldete Konten (Hallenplan,
 * `v5_messestand`), und das bleibt so. Die Route prüft deshalb
 * `is_marketing_team()` und signiert mit `service_role` genau einen Pfad unter
 * `<edition>/media_kit/`, den sie selbst baut. `set_edition_file` prüft Rolle
 * und Art ein zweites Mal: das Marketing darf nur das Media Kit pflegen.
 */
export async function POST(request: Request) {
  await requireAdminSection("graphics", "/admin/grafiken");
  const supabase = await createSupabaseServerClient();
  const { data: darf } = await supabase.rpc("is_marketing_team");
  if (!darf) return NextResponse.json({ error: "not_allowed" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const editionId = String(body.edition_id ?? "");
  if (!UUID.test(editionId)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  return new URL(request.url).searchParams.get("step") === "url"
    ? platzGeben(body, editionId)
    : eintragen(supabase, body, editionId);
}

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Schritt 1: einen signierten Platz im Bucket herausgeben. */
async function platzGeben(body: Record<string, unknown>, editionId: string) {
  const contentType = String(body.content_type ?? "");
  if (!ERLAUBT.has(contentType)) {
    return NextResponse.json({ error: "wrong_type", detail: contentType }, { status: 415 });
  }
  const size = Number(body.size_bytes ?? 0);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  // Dateiname entschärfen: der Pfad ist ein Schlüssel, kein Anzeigetext.
  const sauber = String(body.filename ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-80);
  const path = `${editionId}/${ART}/${crypto.randomUUID()}-${sauber || "datei"}`;

  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[media-kit] Upload-Adresse nicht erstellt:", error?.message);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
  return NextResponse.json({ path: data.path, token: data.token });
}

/** Schritt 2: den Eintrag anlegen — und aufräumen, wenn das scheitert. */
async function eintragen(supabase: Client, body: Record<string, unknown>, editionId: string) {
  const path = String(body.path ?? "");
  const mime = String(body.mime ?? "");
  const size = Number(body.size_bytes ?? 0);
  if (!path.startsWith(`${editionId}/${ART}/`) || path.split("/").length !== 3) {
    return NextResponse.json({ error: "invalid_path", detail: path }, { status: 400 });
  }
  if (!ERLAUBT.has(mime)) {
    return NextResponse.json({ error: "wrong_type", detail: mime }, { status: 415 });
  }

  // Über die Session, nicht über den Admin-Client: `uploaded_by` und das Audit
  // nennen dann die Person, nicht den Dienst.
  const { data, error } = await supabase.rpc("set_edition_file", {
    p_data: {
      edition_id: editionId,
      kind: ART,
      storage_path: path,
      filename: String(body.filename ?? "") || "datei",
      mime,
      size_bytes: Number.isFinite(size) && size > 0 ? String(size) : null,
      label_de: String(body.label_de ?? "").trim() || null,
      label_en: String(body.label_en ?? "").trim() || null,
      audience: ["partner"],
    },
  });
  if (error) {
    // Ohne Eintrag darf die Datei nicht liegen bleiben — sonst sammelt der
    // Bucket Waisen, die niemand mehr zuordnen kann.
    await createSupabaseAdminClient().storage.from(BUCKET).remove([path]);
    const f = toRpcFailure(error);
    return NextResponse.json({ error: f.key, detail: f.detail }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: data, path });
}

/** Eintrag **und** Datei entfernen — die RPC prüft Rolle und Art und gibt den Pfad zurück. */
export async function DELETE(request: Request) {
  await requireAdminSection("graphics", "/admin/grafiken");
  const supabase = await createSupabaseServerClient();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const { data: path, error } = await supabase.rpc("delete_edition_file", { p_id: id });
  if (error) {
    const f = toRpcFailure(error);
    return NextResponse.json({ error: f.key }, { status: error.code === "42501" ? 403 : 400 });
  }
  if (typeof path === "string") {
    await createSupabaseAdminClient().storage.from(BUCKET).remove([path]);
  }
  return NextResponse.json({ ok: true });
}
