import { requireArea } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vivenuShopBase } from "@/lib/vivenu/naming";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Weiterleitung auf die eigene vivenu-Ticketseite (SPK-037).
 *
 * Konrad am 23.09.: die Wallet-Funktion gibt es in vivenu nativ. **Abrufen
 * lässt sie sich nicht** — in allen 447 Pfaden der vivenu-API kommt Wallet nur
 * als Vorlage vor (Farben, Logo, Codeart), nie als Datei. Statt Pässe selbst
 * zu signieren, führt diese Route dorthin, wo die Knöpfe stehen.
 *
 * **Das Secret geht nicht als Datum in den Browser.** Die RPC gibt es hier
 * heraus, die Route baut daraus die Adresse und schickt eine Weiterleitung.
 * Dass es danach in der Adresszeile der Speakerin steht, ist unvermeidlich:
 * dieser Link **ist** der Zugang zum Ticket, genau wie in vivenus Ticket-Mail.
 *
 * Wer was sehen darf, entscheidet `my_ticket_wallet_link` — nur die
 * Inhaberin, nicht die Assistenz, und nur bei einem ausgestellten Ticket.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  await requireArea("speaker", `/api/speaker/ticket-wallet${url.search}`);

  const id = url.searchParams.get("ticket") ?? "";
  if (!UUID.test(id)) return new Response("invalid request", { status: 400 });

  const base = vivenuShopBase();
  if (!base) {
    // Lieber gar kein Link als ein erfundener: eine falsche Adresse merkt man
    // erst am Eventtag (dieselbe Regel wie beim Undershop-Link, 12.09.).
    console.error("[ticket-wallet] VIVENU_SHOP_BASE fehlt");
    return new Response("not configured", { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_ticket_wallet_link", { p_ticket_id: id });
  if (error) {
    return new Response(error.code === "42501" ? "not allowed" : "not found", {
      status: error.code === "42501" ? 403 : 404,
    });
  }

  const teile = (data ?? null) as { vivenu_ticket_id: string; secret: string } | null;
  if (!teile) return new Response("not found", { status: 404 });

  const ziel = `${base}/ticket/${encodeURIComponent(teile.vivenu_ticket_id)}/${encodeURIComponent(teile.secret)}`;
  return new Response(null, {
    status: 302,
    headers: {
      location: ziel,
      // Ein Ticketlink gehört in keinen geteilten Zwischenspeicher, und die
      // Adresse mit dem Secret soll nicht als Referrer weiterwandern.
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
