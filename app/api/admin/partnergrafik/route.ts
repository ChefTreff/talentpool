import { NextResponse } from "next/server";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";

export const dynamic = "force-dynamic";

/** Dieselbe Ablage wie die übrigen Dateien der Organisation: `<edition>/<org>/partner_graphic/<datei>`. */
const BUCKET = "partner-assets";
const ART = "partner_graphic";
const MAX_BYTES = 25 * 1024 * 1024;
/** Wie `set_partner_graphic`: eine Grafik zum Teilen, Bild oder PDF. */
const ERLAUBT = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Die persönliche Partnergrafik („Wir sind dabei“) einer Organisation hochladen
 * oder ersetzen (PART-041, ADM-023) — für das Marketing unter `/admin/grafiken`.
 *
 * Zwei Schritte ohne Bytes durch den Server, wie bei den Bildern am Auftritt.
 * Signiert wird mit dem **Session-Client**: die Bucket-Policy
 * (`partner_asset_path_allowed(name, true)`) lässt für diese Art nur Marketing
 * und Partner-Team schreiben, der Partner selbst darf nur lesen. So entscheidet
 * weiter die Policy, nicht dieser Code. `set_partner_graphic` prüft Rolle, Pfad,
 * Objekt und Format ein zweites Mal und legt eine neue Version an.
 */
export async function POST(request: Request) {
  await requireAdminSection("graphics", "/admin/grafiken");
  const supabase = await createSupabaseServerClient();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const orgId = String(body.org_id ?? "");
  const editionId = String(body.edition_id ?? "");
  if (!UUID.test(orgId) || !UUID.test(editionId)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  return new URL(request.url).searchParams.get("step") === "url"
    ? platzGeben(supabase, body, orgId, editionId)
    : eintragen(supabase, body, orgId, editionId);
}

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Schritt 1: einen signierten Platz im Bucket herausgeben. */
async function platzGeben(supabase: Client, body: Record<string, unknown>, orgId: string, editionId: string) {
  const contentType = String(body.content_type ?? "");
  if (!ERLAUBT.has(contentType)) {
    return NextResponse.json({ error: "wrong_type", detail: contentType }, { status: 415 });
  }
  const size = Number(body.size_bytes ?? 0);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  const sauber = String(body.filename ?? "").replace(/[^\w.\-]+/g, "-").slice(-80) || "partnergrafik";
  const path = `${editionId}/${orgId}/${ART}/${Date.now()}-${sauber}`;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    // Die Policy sagt Nein, oder der Storage ist nicht erreichbar — ins Log, nicht in die Antwort.
    console.error("[partnergrafik] Upload-Adresse nicht erstellt:", error?.message);
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }
  return NextResponse.json({ path: data.path, token: data.token });
}

/** Schritt 2: die neue Version eintragen — und aufräumen, wenn das scheitert. */
async function eintragen(supabase: Client, body: Record<string, unknown>, orgId: string, editionId: string) {
  const path = String(body.path ?? "");
  const mime = String(body.mime ?? "");
  const size = Number(body.size_bytes ?? 0);
  if (!path.startsWith(`${editionId}/${orgId}/${ART}/`) || path.split("/").length !== 4) {
    return NextResponse.json({ error: "invalid_path", detail: path }, { status: 400 });
  }
  if (!ERLAUBT.has(mime)) {
    return NextResponse.json({ error: "wrong_type", detail: mime }, { status: 415 });
  }

  const { data, error } = await supabase.rpc("set_partner_graphic", {
    p_org_id: orgId,
    p_storage_path: path,
    p_filename: String(body.filename ?? "") || "partnergrafik",
    p_mime: mime,
    p_size_bytes: Number.isFinite(size) && size > 0 ? size : null,
    p_edition_id: editionId,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    const f = toRpcFailure(error);
    return NextResponse.json({ error: f.key, detail: f.detail }, { status: error.code === "42501" ? 403 : 400 });
  }
  return NextResponse.json({ ok: true, ...(data as { id: string; version: number }) });
}
