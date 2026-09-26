/**
 * Die Schlüssel, über die Seiten ein Video einbinden (`loadVideo`), mit der
 * Seite dazu. `/admin/videos` zeigt die Liste, damit sichtbar ist, wo ein Link
 * noch fehlt — ohne Video lässt eine Seite den Block weg oder sagt, wann es
 * kommt (PART-039, PART-075). `tests/partner-kleine-punkte.test.ts` prüft, dass
 * jeder Aufruf von `loadVideo` hier steht.
 */
export const VIDEO_SCHLUESSEL = [
  { key: "partner_tickets", seite: "/partner/tickets" },
  { key: "partner_event_app", seite: "/partner/event-app" },
  { key: "partner_shop", seite: "/partner/shop" },
] as const;
