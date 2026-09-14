import { NextResponse } from "next/server";
import { requireArea } from "@/lib/auth";
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

/**
 * Hallenplan und andere Editionsdateien hochladen (F10).
 *
 * Der Bucket hat **keine** INSERT-Policy für `authenticated` — das ist Absicht.
 * Ein Hallenplan ist nichts, was ein Partner austauschen können soll, und eine
 * Policy, die „Produktion darf" ausdrückt, müsste die Rollenlogik im Storage
 * nachbauen. Stattdessen: Rechte hier prüfen, dann mit `service_role` schreiben
 * und den Eintrag über `set_edition_file` anlegen — die RPC prüft die Rolle
 * ein zweites Mal.
 */
export async function POST(request: Request) {
  await requireArea("produktion", "/produktion/dateien");
  const supabase = await createSupabaseServerClient();
  const [{ data: produktion }, { data: staff }] = await Promise.all([
    supabase.rpc("is_production_team"),
    supabase.rpc("is_staff"),
  ]);
  if (!produktion && !staff) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  const editionId = String(form.get("edition_id") ?? "");
  const kind = String(form.get("kind") ?? "");
  const labelDe = String(form.get("label_de") ?? "").trim();
  const labelEn = String(form.get("label_en") ?? "").trim();

  if (!(file instanceof File) || editionId === "" || kind === "") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
  if (!ERLAUBT.has(file.type)) {
    return NextResponse.json({ error: "wrong_type", detail: file.type }, { status: 415 });
  }

  const safe = file.name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-80);
  const path = `${editionId}/${kind}/${crypto.randomUUID()}-${safe || "datei"}`;

  const admin = createSupabaseAdminClient();
  const up = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return NextResponse.json({ error: "upload_failed", detail: up.error.message }, { status: 500 });

  // Eintrag über die **Session**, nicht über den Admin-Client: so steht in
  // `uploaded_by` und im Audit-Log die Person und nicht der Dienst.
  const { data, error } = await supabase.rpc("set_edition_file", {
    p_data: {
      edition_id: editionId,
      kind,
      storage_path: path,
      filename: file.name,
      mime: file.type,
      size_bytes: String(file.size),
      label_de: labelDe || null,
      label_en: labelEn || null,
    },
  });
  if (error) {
    // Der Eintrag fehlt — dann darf die Datei nicht liegen bleiben, sonst
    // sammelt der Bucket Waisen, die niemand mehr zuordnen kann.
    await admin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: data, path });
}

/** Eintrag **und** Datei entfernen. */
export async function DELETE(request: Request) {
  await requireArea("produktion", "/produktion/dateien");
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
