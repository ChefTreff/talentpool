/**
 * Der Aufruf von „Angebot erstellen“ im Warenkorb (PART-116): ein `fetch` an `/api/partner/shop/angebot` mit dem Fehlerschlüssel, den die Oberfläche in `rpc.*` nachschlägt.
 *
 * Eigene Datei ohne Browser-Bezug, damit die Antwortformen der Route prüfbar sind (`tests/shop-angebot-oberflaeche.test.ts`). Eine Server Action ist es bewusst
 * nicht: das Angebot kann in SevDesk bis zu einer Minute dauern, und eine Route hat dafür ein eigenes `maxDuration`.
 */
export type AngebotAntwort =
  | { ok: true; number: string; validUntil: string; probe: boolean }
  | { ok: false; key: string; detail?: string };

/**
 * „Angebot beim Team anfragen“: der Mailto-Link mit Betreff und vorbereitetem Text. Dorthin geht, wer kein automatisches Angebot bekommt (keine Kundennummer,
 * Ausland, unvollständige Adresse, abgeschaltet, drei Angebote verbraucht) — die Gründe stehen in `lib/sevdesk/angebot.ts` und in `shop_quote_begin`.
 */
export function anfrageMailto(a: { mailbox: string; subject: string; body: string }): string {
  return `mailto:${a.mailbox}?subject=${encodeURIComponent(a.subject)}&body=${encodeURIComponent(a.body)}`;
}

/** Schlüssel für „die Antwort kam nicht an“ — kein Datenbankfehler, sondern die Leitung; die Oberfläche übersetzt ihn selbst (`partnerShop.quoteNetwork`). */
export const ANGEBOT_NETZWERK = "network";

export async function angebotAnfordern(orderId: string, fetchFn: typeof fetch = fetch): Promise<AngebotAntwort> {
  let res: Response;
  try {
    res = await fetchFn("/api/partner/shop/angebot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
  } catch {
    return { ok: false, key: ANGEBOT_NETZWERK };
  }
  const body = (await res.json().catch(() => null)) as {
    ok?: unknown;
    number?: unknown;
    validUntil?: unknown;
    probe?: unknown;
    error?: unknown;
    detail?: unknown;
  } | null;
  if (res.ok && body?.ok === true && typeof body.number === "string" && typeof body.validUntil === "string") {
    return { ok: true, number: body.number, validUntil: body.validUntil, probe: body.probe === true };
  }
  const key = typeof body?.error === "string" && body.error !== "" ? body.error : "unknown";
  return { ok: false, key, ...(typeof body?.detail === "string" && body.detail !== "" ? { detail: body.detail } : {}) };
}
