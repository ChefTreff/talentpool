/**
 * Schlüssel, deren `detail` für Menschen geschrieben ist: ein Zeitfenster
 * „HH:MI–HH:MI“ aus `create_slot` und `move_slot`.
 *
 * Alle anderen Details bleiben aus dem Toast heraus. Bei `slot_overlap` (23P01)
 * schreibt Postgres die Schlüssel beider Slots samt Zeitbereich hinein, bei
 * einer verletzten CHECK-Regel die ganze Zeile („Failing row contains …“) —
 * beides ist Diagnose, keine Meldung.
 */
const LESBARES_DETAIL = new Set(["outside_partner_window", "outside_stage_day"]);

/**
 * Fehlertext einer Board-Aktion: die Meldung zum Schlüssel, bei einem
 * Zeitfenster das Fenster dahinter (LEAD-034 — vorher fehlte es beim
 * Verschieben, und „Außerhalb eures Zeitfensters“ sagte nicht, welches).
 */
export function fehlerText(
  message: (key: string) => string,
  res: { key: string; detail?: string },
): string {
  const text = message(res.key);
  return res.detail && LESBARES_DETAIL.has(res.key) ? `${text} (${res.detail})` : text;
}
