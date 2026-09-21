import "server-only";
import { sd } from "@/lib/sevdesk/client";

/**
 * Belege aus SevDesk holen — **nur lesen.**
 *
 * Kein Anlegen, kein Ändern, kein Löschen. Ein Portal, das in der Buchhaltung
 * schreiben darf, ist ein Portal, das eine Rechnung verändern kann.
 */

type SdList<T> = { objects?: T };

export type SevdeskBeleg = {
  /** `invoice` oder `offer` — daraus wird `partner_asset.kind`. */
  kind: "invoice" | "offer";
  /** Die SevDesk-Id. Sie wird zum Dateinamen und macht den Abruf idempotent. */
  id: string;
  /** Die Nummer, die der Partner auf dem Papier sieht. */
  nummer: string | null;
  datum: string | null;
};

type SdInvoice = { id: string; invoiceNumber?: string | null; invoiceDate?: string | null };
type SdOrder = { id: string; orderNumber?: string | null; orderDate?: string | null };

/**
 * Was für diesen Kontakt drüben liegt.
 *
 * Entwürfe bleiben draussen: ein Angebot, das noch nicht verschickt ist, hat im
 * Portal des Partners nichts zu suchen. SevDesk führt dafür `status` — 100 ist
 * der Entwurf, alles darüber ist heraus.
 */
export async function listDocuments(contactId: string): Promise<SevdeskBeleg[]> {
  const frage = `contact[id]=${encodeURIComponent(contactId)}&contact[objectName]=Contact&limit=200`;

  const [rechnungen, angebote] = await Promise.all([
    sd<SdList<SdInvoice[]>>(`/Invoice?${frage}&status[]=200&status[]=1000`),
    sd<SdList<SdOrder[]>>(`/Order?${frage}&status[]=200&status[]=300&status[]=500&status[]=1000`),
  ]);

  const out: SevdeskBeleg[] = [];
  for (const r of rechnungen.objects ?? []) {
    out.push({ kind: "invoice", id: String(r.id), nummer: r.invoiceNumber ?? null, datum: r.invoiceDate ?? null });
  }
  for (const a of angebote.objects ?? []) {
    out.push({ kind: "offer", id: String(a.id), nummer: a.orderNumber ?? null, datum: a.orderDate ?? null });
  }
  return out;
}

/**
 * Das PDF eines Belegs.
 *
 * SevDesk liefert es base64-kodiert in `content`. Wir geben Bytes zurück — was
 * damit passiert, entscheidet der Aufrufer, und der legt sie im Bucket ab.
 */
export async function downloadPdf(beleg: SevdeskBeleg): Promise<Uint8Array> {
  const pfad = beleg.kind === "invoice" ? "Invoice" : "Order";
  const res = await sd<{ objects?: { content?: string } }>(
    `/${pfad}/${encodeURIComponent(beleg.id)}/getPdf`,
  );
  const content = res.objects?.content;
  if (!content) throw new Error(`SevDesk hat kein PDF geliefert (${pfad} ${beleg.id})`);
  return Uint8Array.from(Buffer.from(content, "base64"));
}
