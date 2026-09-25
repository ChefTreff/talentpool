import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasSevdeskToken } from "@/lib/sevdesk/client";
import { downloadPdf, findContactByCustomerNumber, listDocuments } from "@/lib/sevdesk/documents";

const BUCKET = "partner-assets";

export type BelegErgebnis = {
  jobId: number | null;
  /** Neu abgelegte Belege. */
  added: number;
  /** Schon vorhanden, nicht erneut geladen. */
  known: number;
  failed: number;
  /** Organisationen, die angefasst wurden. */
  orgs: number;
  /** Über die Kundennummer aufgelöst und gemerkt (ADM-050). */
  aufgeloest: number;
  /** Hatten eine Kundennummer, aber drüben keinen eindeutigen Kontakt. */
  ohneKontakt: string[];
  skippedReason?: string;
};

type Ziel = {
  org_id: string;
  org_edition_id: string;
  edition_id: string;
  org_name: string;
  sevdesk_contact_id: string | null;
  customer_number: string | null;
  bekannt: string[];
};

/**
 * Angebote und Rechnungen aus SevDesk ins Partnerportal holen.
 *
 * **Es wird nur geladen, was fehlt.** `bekannt` nennt die schon abgelegten
 * Dateinamen; wer jeden Beleg jede Nacht neu herunterzieht, bezahlt das mit
 * Laufzeit und reizt das Fremdsystem ohne Gewinn.
 *
 * Ein Fehler an einem Beleg hält den Lauf nicht auf. Er steht in
 * `integration.sync_error` mit der SevDesk-Id, die übrigen laufen weiter — ein
 * Abbruch beim ersten Problem hiesse, dass eine kaputte Rechnung alle anderen
 * Partner um ihre Belege bringt.
 *
 * `supabase` ist der Client des Teammitglieds (die Zielliste prüft
 * `is_partner_team()`), `admin` legt ab und schreibt Protokoll — nach der
 * Rollenprüfung, nie davor.
 */
export async function syncPartnerDocuments(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  triggeredBy: string,
): Promise<BelegErgebnis> {
  const out: BelegErgebnis = { jobId: null, added: 0, known: 0, failed: 0, orgs: 0, aufgeloest: 0, ohneKontakt: [] };

  const { data, error } = await supabase.rpc("sevdesk_document_targets", { p_edition_id: null });
  if (error) throw new Error(error.message);
  const ziele = (data ?? []) as Ziel[];
  out.orgs = ziele.length;

  if (!hasSevdeskToken()) {
    out.skippedReason = "SEVDESK_API_TOKEN fehlt";
    return out;
  }

  const { data: jobId } = await admin.rpc("start_sync_job", {
    p_system: "sevdesk",
    p_direction: "in",
    p_job_type: "partner_documents",
    p_triggered_by: triggeredBy,
  });
  out.jobId = typeof jobId === "number" ? jobId : null;

  for (const ziel of ziele) {
    // ADM-050: Ohne SevDesk-Kennung über die Kundennummer auflösen. Die Kennung
    // schreibt sonst nur `record_shop_invoice` — ein Partner mit Angebot und
    // Rechnung, aber ohne Messeshop-Bestellung, fiel deshalb still aus dem Abruf.
    let kontakt = ziel.sevdesk_contact_id?.trim() || null;
    if (!kontakt && ziel.customer_number) {
      try {
        kontakt = await findContactByCustomerNumber(ziel.customer_number);
      } catch (fehler) {
        out.failed += 1;
        await melden(admin, out.jobId, ziel.org_id, fehler);
        continue;
      }
      if (kontakt) {
        out.aufgeloest += 1;
        // Merken, damit die Auflösung einmal passiert und nicht jede Nacht.
        // Dieselbe Bedingung wie im Messeshop-Lauf: nur, wenn nichts dasteht.
        await supabase.rpc("set_org_sevdesk_contact", { p_org_id: ziel.org_id, p_contact_id: kontakt });
      }
    }
    if (!kontakt) {
      // Sichtbar statt still: wer keine Belege bekommt, steht namentlich im Lauf.
      out.ohneKontakt.push(ziel.org_name);
      continue;
    }

    let belege;
    try {
      belege = await listDocuments(kontakt);
    } catch (fehler) {
      out.failed += 1;
      await melden(admin, out.jobId, ziel.org_id, fehler);
      continue;
    }

    for (const beleg of belege) {
      const datei = `${beleg.id}.pdf`;
      if (ziel.bekannt.includes(datei)) {
        out.known += 1;
        continue;
      }
      try {
        const bytes = await downloadPdf(beleg);
        const pfad = `${ziel.edition_id}/${ziel.org_id}/documents/${datei}`;
        // Erst die Datei, dann die Zeile: `register_sevdesk_document` prüft, ob
        // das Objekt im Bucket liegt, und weist sonst ab. Andersherum stünde in
        // der Liste ein Beleg, den niemand öffnen kann.
        const { error: upFehler } = await admin.storage
          .from(BUCKET)
          .upload(pfad, bytes, { contentType: "application/pdf", upsert: true });
        if (upFehler) throw new Error(upFehler.message);

        const { error: regFehler } = await admin.rpc("register_sevdesk_document", {
          p_org_edition_id: ziel.org_edition_id,
          p_kind: beleg.kind,
          p_storage_path: pfad,
          p_filename: datei,
          p_size_bytes: bytes.byteLength,
        });
        if (regFehler) throw new Error(regFehler.message);
        out.added += 1;
      } catch (fehler) {
        out.failed += 1;
        await melden(admin, out.jobId, `${ziel.org_id}/${beleg.kind}/${beleg.id}`, fehler);
      }
    }
  }

  if (out.jobId !== null) {
    await admin.rpc("finish_sync_job", {
      p_id: out.jobId,
      p_status: out.failed === 0 ? "ok" : out.added > 0 ? "partial" : "failed",
      // Namen bleiben aus dem Protokoll heraus, dort zählt die Zahl.
      p_stats: { added: out.added, known: out.known, failed: out.failed, orgs: out.orgs,
                 aufgeloest: out.aufgeloest, ohneKontakt: out.ohneKontakt.length },
    });
  }
  return out;
}

async function melden(
  admin: SupabaseClient,
  jobId: number | null,
  objektId: string,
  fehler: unknown,
): Promise<void> {
  const text = fehler instanceof Error ? fehler.message : String(fehler);
  console.error(`[partner-documents] ${objektId}:`, text);
  if (jobId === null) return;
  await admin.rpc("record_sync_error", {
    p_job_id: jobId,
    p_object_type: "partner_document",
    p_object_id: objektId,
    p_message: text.slice(0, 500),
  });
}
