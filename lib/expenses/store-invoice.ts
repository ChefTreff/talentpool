import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Ablage der Auslagenrechnung.
 *
 * Das ist der einzige service_role-Schreibweg im Speaker-Umfeld, und er ist
 * Absicht: Das Dokument, das an SevDesk und ins Qonto-Postfach geht, muss aus
 * den eingefrorenen Daten des Antrags entstehen — nicht aus einer Datei, die
 * ein Client hochlädt. Deshalb nimmt `register_speaker_asset` die Art
 * `invoice` gar nicht erst an.
 *
 * Vor jedem Aufruf steht `requireExpenseApprover()`: die Prüfung läuft über
 * den **Nutzer-Client**, nicht über service_role.
 */

export async function requireExpenseApprover(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.rpc("is_expense_approver");
  if (error) throw new Error(`is_expense_approver: ${error.message}`);
  if (data !== true) {
    throw new Error("not allowed: expense approver required");
  }
}

export async function storeInvoiceAsset(input: {
  claimId: string;
  profileId: string;
  invoiceNo: string;
  bytes: Uint8Array;
}): Promise<{ assetId: string; path: string }> {
  const admin = createSupabaseAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("speaker_profile")
    .select("edition_id")
    .eq("id", input.profileId)
    .single();
  if (profileError || !profile) throw new Error("speaker_profile nicht gefunden");

  const path = `${profile.edition_id}/${input.profileId}/invoice/${input.invoiceNo}.pdf`;
  const { error: uploadError } = await admin.storage
    .from("speaker-assets")
    .upload(path, input.bytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw new Error(`Upload: ${uploadError.message}`);

  // Der Pfad enthält die Rechnungsnummer, ist also für dieselbe Rechnung immer
  // derselbe — und `speaker_asset.storage_path` ist eindeutig. Ein zweiter
  // Anlauf (Wiederholung nach einem Fehler) schreibt deshalb dieselbe Zeile
  // fort, statt an der Eindeutigkeit zu scheitern.
  const { data: asset, error: upsertError } = await admin
    .from("speaker_asset")
    .upsert(
      {
        profile_id: input.profileId,
        kind: "invoice",
        storage_path: path,
        filename: `${input.invoiceNo}.pdf`,
        mime: "application/pdf",
        size_bytes: input.bytes.byteLength,
        version: 1,
        is_current: true,
      },
      { onConflict: "storage_path" },
    )
    .select("id")
    .single();
  if (upsertError || !asset) throw new Error(`speaker_asset: ${upsertError?.message}`);

  // Erst wenn die neue Fassung steht, verlieren ältere ihr „aktuell". Anders
  // herum stünde der Antrag nach einem Fehler ganz ohne aktuelle Rechnung da.
  await admin
    .from("speaker_asset")
    .update({ is_current: false })
    .eq("profile_id", input.profileId)
    .eq("kind", "invoice")
    .eq("is_current", true)
    .neq("id", asset.id);

  return { assetId: asset.id as string, path };
}
