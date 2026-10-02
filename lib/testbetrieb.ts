/**
 * Schalter des Testbetrieb-Hinweises (QS-056 c, Plan 02.10.2026).
 *
 * Solange das Team gegen die Live-Datenbank testet, steht unter der Kopfzeile
 * jeder Portalseite und jeder Admin-Seite ein schmaler Streifen: „Testbetrieb —
 * Daten mit ZZTEST sind Testdaten“. Der Baustein ist
 * `components/ui/TestbetriebHinweis.tsx`, eingebaut ist er **einmal** in
 * `components/layout/SidebarShell.tsx`.
 *
 * **Vorgabe: an.** Aus geht er nur mit dem Wert `false` in
 * `NEXT_PUBLIC_TESTBETRIEB_HINWEIS` — beim Go-live, die Zeile steht in
 * `docs/abschluss-checkliste.md`. Alles andere, auch `0`, `off` oder ein
 * Tippfehler, lässt ihn stehen: Ein zu früh abgeschalteter Hinweis fiele erst
 * auf, wenn jemand echte Daten für Testdaten hält; ein stehengebliebener fällt
 * allen sofort auf.
 *
 * `NEXT_PUBLIC_*` wird beim Build in den Code geschrieben (Next-Doku „Environment
 * Variables“): Nach dem Setzen in Vercel braucht es einen Redeploy, und die
 * Variable muss **wörtlich** gelesen werden — ein berechneter Name wird nicht
 * ersetzt. Deshalb steht der Zugriff hier im Standardwert und nirgends sonst.
 */
export function testbetriebAktiv(
  wert: string | undefined = process.env.NEXT_PUBLIC_TESTBETRIEB_HINWEIS,
): boolean {
  // `trim`, weil ein Wert, der mit Zeilenumbruch gesetzt wurde, sonst den
  // Hinweis am Go-live stehen ließe, obwohl „false“ eingetragen ist.
  return wert?.trim() !== "false";
}
