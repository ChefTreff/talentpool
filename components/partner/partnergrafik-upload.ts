import { postJson } from "@/lib/fetch-json";
import { GRAFIK_ERLAUBT, GRAFIK_MAX_BYTES } from "@/components/partner/media-kit";

export type AblageErgebnis = { ok: true } | { ok: false; key: string };

/**
 * Die Partnergrafik („Wir sind dabei“, PART-041) einer Organisation ablegen oder
 * ersetzen — für das Marketing unter `/admin/grafiken`. Jede Datei ist eine neue
 * Version (`set_partner_graphic`), die alte bleibt im Verlauf.
 *
 * Drei Schritte, ohne Bytes durch den Server: einen signierten Platz holen, die
 * Datei direkt in den Bucket legen, die Zeile eintragen. Die Route prüft Rolle,
 * Pfad und Format ein zweites Mal; der Browser prüft vorher, damit niemand 20 MB
 * hochlädt, die hinterher abgewiesen werden.
 *
 * Die Funktion steht hier, weil zwei Stellen sie brauchen — der Upload einer
 * fertigen Datei in der Liste (`PartnergrafikenAdmin`) und „Als Partnergrafik
 * ablegen“ im Generator (`MeetUsAt`, PART-097). Sie wirft nie: jeder Ausgang ist
 * ein Ergebnis mit Fehlerschlüssel (`wrong_type`, `too_large`, `upload_failed`,
 * sonst der Schlüssel der Route).
 */
export async function partnergrafikAblegen(orgId: string, editionId: string, file: File): Promise<AblageErgebnis> {
  try {
    if (!GRAFIK_ERLAUBT.includes(file.type)) return { ok: false, key: "wrong_type" };
    if (file.size > GRAFIK_MAX_BYTES) return { ok: false, key: "too_large" };
    const platz = await postJson<{ path: string; token: string }>("/api/admin/partnergrafik?step=url", {
      org_id: orgId,
      edition_id: editionId,
      content_type: file.type,
      size_bytes: file.size,
      filename: file.name,
    });
    if (!platz.ok) return { ok: false, key: platz.key };
    // Erst hier geladen: die Prüfungen oben und der Platz brauchen den Browser-Client nicht,
    // und so lässt sich die Funktion ohne Supabase-Umgebung prüfen.
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
    const { error } = await createSupabaseBrowserClient()
      .storage.from("partner-assets")
      .uploadToSignedUrl(platz.data.path, platz.data.token, file, { contentType: file.type });
    if (error) return { ok: false, key: "upload_failed" };
    const zeile = await postJson<{ ok: boolean }>("/api/admin/partnergrafik", {
      path: platz.data.path,
      org_id: orgId,
      edition_id: editionId,
      filename: file.name,
      mime: file.type,
      size_bytes: file.size,
    });
    if (!zeile.ok) return { ok: false, key: zeile.key };
    return { ok: true };
  } catch {
    return { ok: false, key: "unknown" };
  }
}
