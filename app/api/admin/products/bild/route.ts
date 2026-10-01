import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAnyAdminSection } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import { BILD_MIMES, verkleinere } from "@/lib/edition-files/verkleinern.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "product-images";
/** Vercel nimmt je Anfrage etwa 4,5 MB; größere Bilder bitte vorher verkleinern. */
const MAX_BYTES = 4 * 1024 * 1024;
const SKU = /^(I-\d{5}|INI-[A-Z0-9-]{3,20})$/;

type Bild = { path: string; url: string; name: string; type: string; size: number };

/**
 * Produktbild hochladen oder entfernen (PROD-006).
 *
 * Bisher kamen Produktbilder nur über `scripts/import-product-images.mjs`. Der
 * Bucket `product-images` ist öffentlich lesbar (Marketingmaterial ohne
 * Personenbezug, 0050), geschrieben wird nur hier mit der Service-Rolle —
 * **nach** der Abschnittsprüfung. Das Bild wird mit `verkleinere()` neu
 * gerechnet (höchstens 2000 px, WebP, ohne Metadaten). Den Eintrag in
 * `product.images` schreibt `upsert_product` über die **Sitzung**: die
 * Datenbank prüft die Rechte noch einmal, und das Audit trägt die Person.
 * Scheitert der Eintrag, wird die Datei wieder entfernt.
 */
async function bilderVon(sku: string): Promise<Bild[] | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_products");
  if (error) return null;
  const p = ((data ?? []) as { sku: string; images: Bild[] | null }[]).find((x) => x.sku === sku);
  return p ? (p.images ?? []) : null;
}

async function schreibe(sku: string, images: Bild[]) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("upsert_product", { p_data: { sku, images } });
}

export async function POST(request: Request) {
  await requireAnyAdminSection(["partner", "productCatalog"], "/admin/produktion/produkte");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }
  const sku = String(form.get("sku") ?? "");
  const datei = form.get("file");
  if (!SKU.test(sku)) return NextResponse.json({ error: "invalid_sku" }, { status: 400 });
  if (!(datei instanceof File) || !BILD_MIMES.has(datei.type)) return NextResponse.json({ error: "wrong_type" }, { status: 415 });
  if (datei.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const vorhanden = await bilderVon(sku);
  if (vorhanden === null) return NextResponse.json({ error: "not_allowed" }, { status: 403 });

  let buffer: Buffer;
  try {
    buffer = (await verkleinere(Buffer.from(await datei.arrayBuffer()))).buffer;
  } catch {
    return NextResponse.json({ error: "wrong_type" }, { status: 415 });
  }
  const pfad = `${sku}/${randomUUID()}.webp`;
  const admin = createSupabaseAdminClient();
  const { error: upErr } = await admin.storage.from(BUCKET).upload(pfad, buffer, { contentType: "image/webp", upsert: false });
  if (upErr) {
    console.error("[produkte/bild] Upload:", upErr.message);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
  const url = admin.storage.from(BUCKET).getPublicUrl(pfad).data.publicUrl;
  const name = datei.name.replace(/\.[^.]+$/, "").slice(0, 80) + ".webp";
  const images = [...vorhanden, { path: pfad, url, name, type: "image/webp", size: buffer.length }];
  const { error } = await schreibe(sku, images);
  if (error) {
    await admin.storage.from(BUCKET).remove([pfad]);
    return NextResponse.json({ error: toRpcFailure(error).key }, { status: 400 });
  }
  return NextResponse.json({ ok: true, images });
}

export async function DELETE(request: Request) {
  await requireAnyAdminSection(["partner", "productCatalog"], "/admin/produktion/produkte");
  const params = new URL(request.url).searchParams;
  const sku = params.get("sku") ?? "";
  const pfad = params.get("path") ?? "";
  if (!SKU.test(sku) || !pfad.startsWith(`${sku}/`)) return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  const vorhanden = await bilderVon(sku);
  if (vorhanden === null) return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  const images = vorhanden.filter((b) => b.path !== pfad);
  const { error } = await schreibe(sku, images);
  if (error) return NextResponse.json({ error: toRpcFailure(error).key }, { status: 400 });
  // Erst nach dem Eintrag löschen: scheiterte er, zeigte der Shop sonst ein totes Bild.
  await createSupabaseAdminClient().storage.from(BUCKET).remove([pfad]);
  return NextResponse.json({ ok: true, images });
}
