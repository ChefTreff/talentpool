import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { alsZustand, quellHash } from "@/lib/award/quelle";
import { BILD_MIMES, verkleinere } from "@/lib/edition-files/verkleinern.mjs";
import { HONIGTOPF, MAX_BILDER, MAX_BILD_BYTES } from "@/lib/award/regeln";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TEXTFELDER = [
  "name", "location", "description", "mission", "project", "contact_first_name", "contact_last_name",
  "contact_email", "founded_year", "active_members", "website", "university", "notes",
] as const;

/**
 * Öffentliche Bewerbung zum Initiativen-Award (ADM-024), ohne Login.
 *
 * Reihenfolge mit Absicht: erst die Bilder prüfen und verkleinern (Typ und
 * Größe **vor** `verkleinere()`, Auflage der Architektur-Session), dann
 * `award_apply` — eine abgelehnte Bewerbung hinterlässt so keine Dateien —,
 * zuletzt hochladen und über `award_set_images` eintragen. Die Datenbank
 * prüft Frist, Pflichtfelder, Einwilligung und Ratenbegrenzung und meldet sie
 * als Zustand; die Quelle kommt nur vorgehasht an.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ status: "invalid", field: "form" }, { status: 400 });
  }
  // Roboter bekommen dieselbe Antwort wie Menschen — und es passiert nichts.
  if (String(form.get(HONIGTOPF) ?? "").trim() !== "") return NextResponse.json({ status: "ok" });

  const dateien = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (dateien.length > MAX_BILDER) return NextResponse.json({ status: "invalid", field: "images" }, { status: 400 });
  const bilder: Buffer[] = [];
  for (const datei of dateien) {
    if (!BILD_MIMES.has(datei.type) || datei.size > MAX_BILD_BYTES) {
      return NextResponse.json({ status: "invalid", field: "images" }, { status: 400 });
    }
    try {
      bilder.push((await verkleinere(Buffer.from(await datei.arrayBuffer()))).buffer);
    } catch {
      return NextResponse.json({ status: "invalid", field: "images" }, { status: 400 });
    }
  }

  const daten: Record<string, unknown> = {};
  for (const feld of TEXTFELDER) daten[feld] = String(form.get(feld) ?? "");
  daten.topics = form.getAll("topics").map(String);
  daten.privacy_consent = form.get("privacy_consent") === "true" ? "true" : "false";

  const quelle = quellHash(request.headers);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("award_apply", { p_data: daten, p_ip_hash: quelle });
  if (error) {
    console.error("[award] award_apply:", error.code, error.message);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
  const antwort = (data ?? {}) as { status?: string; field?: string; id?: string; edition_id?: string };
  const status = alsZustand(antwort.status);
  if (status !== "ok" || !antwort.id || !antwort.edition_id) {
    return NextResponse.json({ status, field: antwort.field }, { status: 409 });
  }

  // Bilder ablegen. Scheitert das, bleibt die Bewerbung — ohne Bilder, das Team sieht es.
  const pfade: string[] = [];
  for (const [i, buffer] of bilder.entries()) {
    const pfad = `${antwort.edition_id}/${antwort.id}/${i + 1}.webp`;
    const { error: upErr } = await admin.storage.from("award-images").upload(pfad, buffer, { contentType: "image/webp", upsert: false });
    if (upErr) {
      console.error("[award] Bild-Upload:", upErr.message);
      if (pfade.length) await admin.storage.from("award-images").remove(pfade);
      return NextResponse.json({ status: "ok", images: 0 });
    }
    pfade.push(pfad);
  }
  if (pfade.length) {
    const { data: ok, error: setErr } = await admin.rpc("award_set_images", { p_application_id: antwort.id, p_paths: pfade, p_ip_hash: quelle });
    if (setErr || ok !== "ok") {
      console.error("[award] award_set_images:", setErr?.message ?? ok);
      await admin.storage.from("award-images").remove(pfade);
      return NextResponse.json({ status: "ok", images: 0 });
    }
  }
  return NextResponse.json({ status: "ok", images: pfade.length });
}
