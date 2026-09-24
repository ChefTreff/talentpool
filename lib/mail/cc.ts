const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Personen in Kopie einer Mail aus `mail_log.meta.cc_person_ids` (PART-063,
 * CC-Kontakte der Partner; die Datenbank legt die Liste an: `partner_mail_cc`).
 *
 * Im Protokoll stehen bewusst Personen, keine Adressen: löscht jemand sein
 * Profil, bliebe eine Adresse in der Kopie fremder Mails sonst stehen. Die
 * Adressen löst der Versand erst beim Senden auf (`mail_cc_recipients`, die
 * gelöschte Personen und gesperrte Adressen weglässt). Hier wird die Liste nur
 * bereinigt: keine Kennung, doppelt, oder der Empfänger selbst — fällt weg.
 */
export function ccPersonIds(meta: unknown, recipientPersonId: string | null): string[] {
  const roh = meta && typeof meta === "object" ? (meta as { cc_person_ids?: unknown }).cc_person_ids : undefined;
  if (!Array.isArray(roh)) return [];
  const ids = new Set<string>();
  for (const eintrag of roh) {
    if (typeof eintrag !== "string" || !UUID.test(eintrag)) continue;
    const id = eintrag.toLowerCase();
    if (id !== recipientPersonId?.toLowerCase()) ids.add(id);
  }
  return [...ids];
}
