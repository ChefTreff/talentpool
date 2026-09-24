import { NextResponse } from "next/server";
import { requireAdminSection } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Wie in der Migration: privater Bucket, Pfad `<edition_id>/<kind>/<datei>`. */
const BUCKET = "edition-files";
const MAX_BYTES = 25 * 1024 * 1024;
const ERLAUBT = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hallenplan und andere Editionsdateien hochladen (F10) — **in zwei Schritten,
 * ohne Bytes durch den Server** (PROD-008, Konrad 21.09.).
 *
 * Vorher nahm diese Route die Datei selbst entgegen. Die Route erlaubte 25 MB,
 * der Bucket auch, aber die Plattform hält Funktionsrümpfe bei gut 4 MB an —
 * mit einer HTML-Seite, bevor eine Zeile hier läuft. Der Hallenplan mit 2,9 MB
 * ging durch, ein grösserer nicht, und die Oberfläche sagte dazu nichts.
 * Dieselbe Reparatur wie bei `/admin/grafiken` (ADM-043, PR #100).
 *
 * **Der Bucket hat weiterhin keine Schreib-Policy für angemeldete Konten**, und
 * er bekommt auch keine. Ein Hallenplan ist nichts, was ein Partner austauschen
 * können soll, und eine Policy, die „Produktion darf" ausdrückt, müsste die
 * Rollenlogik im Storage nachbauen. Stattdessen prüft die Route die Rolle und
 * gibt mit `service_role` einen **signierten Platz für genau einen Pfad**
 * heraus. Das ist keine neue Erlaubnis, sondern dieselbe wie vorher — nur
 * nimmt Supabase die Bytes jetzt selbst entgegen statt wir.
 *
 * **Den Pfad bestimmt der Server.** Käme er aus dem Browser, liesse sich aus
 * dem Ordner der Edition hinausschreiben. `set_edition_file` prüft zusätzlich,
 * dass er mit der Edition beginnt, und die Rolle ein zweites Mal.
 */
export async function POST(request: Request) {
  await requireAdminSection("production", "/admin/produktion/dateien");
  const supabase = await createSupabaseServerClient();
  const [{ data: produktion }, { data: staff }] = await Promise.all([
    supabase.rpc("is_production_team"),
    supabase.rpc("is_staff"),
  ]);
  if (!produktion && !staff) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const editionId = String(body.edition_id ?? "");
  const kind = String(body.kind ?? "");
  if (!UUID.test(editionId) || !/^[a-z_]+$/.test(kind)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const schritt = new URL(request.url).searchParams.get("step");
  return schritt === "url"
    ? platzGeben(body, editionId, kind)
    : eintragen(supabase, body, editionId, kind);
}

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Schritt 1: einen signierten Platz im Bucket herausgeben. */
async function platzGeben(body: Record<string, unknown>, editionId: string, kind: string) {
  const contentType = String(body.content_type ?? "");
  if (!ERLAUBT.has(contentType)) {
    return NextResponse.json({ error: "wrong_type", detail: contentType }, { status: 415 });
  }
  const size = Number(body.size_bytes ?? 0);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const safe = String(body.filename ?? "")
    .normalize("NFKD")
    // Die Zerlegung trennt „ü" in „u" und ein kombinierendes Trema; bliebe das
    // stehen, machte der nächste Schritt einen Bindestrich daraus.
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-80);
  const path = `${editionId}/${kind}/${crypto.randomUUID()}-${safe || "datei"}`;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[edition-files] Upload-Adresse nicht erstellt:", error?.message);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
  return NextResponse.json({ path: data.path, token: data.token });
}

/** Schritt 2: den Eintrag anlegen — und aufräumen, wenn das scheitert. */
async function eintragen(
  supabase: Client,
  body: Record<string, unknown>,
  editionId: string,
  kind: string,
) {
  const path = String(body.path ?? "");
  const mime = String(body.mime ?? "");
  const size = Number(body.size_bytes ?? 0);
  const labelDe = String(body.label_de ?? "").trim();
  const labelEn = String(body.label_en ?? "").trim();

  // Derselbe Zuschnitt, den der Server in Schritt 1 gebaut hat. `set_edition_file`
  // prüft nur das Präfix der Edition; die Art gehört genauso festgenagelt,
  // sonst landete eine Datei unter einer fremden Rubrik.
  if (!path.startsWith(`${editionId}/${kind}/`) || path.split("/").length !== 3) {
    return NextResponse.json({ error: "invalid_path", detail: path }, { status: 400 });
  }
  if (!ERLAUBT.has(mime)) {
    return NextResponse.json({ error: "wrong_type", detail: mime }, { status: 415 });
  }

  // Eintrag über die **Session**, nicht über den Admin-Client: so steht in
  // `uploaded_by` und im Audit-Log die Person und nicht der Dienst.
  const { data, error } = await supabase.rpc("set_edition_file", {
    p_data: {
      edition_id: editionId,
      kind,
      storage_path: path,
      filename: String(body.filename ?? "") || "datei",
      mime,
      size_bytes: Number.isFinite(size) && size > 0 ? String(size) : null,
      label_de: labelDe || null,
      label_en: labelEn || null,
    },
  });
  if (error) {
    // Der Eintrag fehlt — dann darf die Datei nicht liegen bleiben, sonst
    // sammelt der Bucket Waisen, die niemand mehr zuordnen kann. Das Aufräumen
    // liegt hier und nicht im Browser: ein geschlossener Tab liesse die Datei
    // zurück.
    await createSupabaseAdminClient().storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: data, path });
}

/** Eintrag **und** Datei entfernen. */
export async function DELETE(request: Request) {
  await requireAdminSection("production", "/admin/produktion/dateien");
  const supabase = await createSupabaseServerClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  // Die RPC prüft die Rolle und gibt den Pfad zurück — erst danach wird gelöscht.
  const { data: path, error } = await supabase.rpc("delete_edition_file", { p_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (typeof path === "string") {
    await createSupabaseAdminClient().storage.from(BUCKET).remove([path]);
  }
  return NextResponse.json({ ok: true });
}
