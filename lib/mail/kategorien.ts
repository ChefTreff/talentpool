import type { AdminSectionKey } from "@/lib/admin-sections";

/**
 * Kategorien der Mail-Vorlagen (ADM-102) und der Abschnitt, der sie öffnet.
 * Dieselbe Zuordnung steht in der Datenbank (`mail_template_section()`); eine
 * Kategorie ohne Abschnitt fällt dort wie hier auf `mail` (nur admin) zurück.
 */
export const MAIL_KATEGORIEN = ["speaker", "partner", "participant", "volunteer", "system"] as const;
export type MailKategorie = (typeof MAIL_KATEGORIEN)[number];

export const KATEGORIE_ABSCHNITT: Record<MailKategorie, AdminSectionKey> = {
  speaker: "mailSpeaker",
  partner: "mailPartner",
  participant: "mailParticipants",
  volunteer: "mailVolunteers",
  system: "mail",
};

/** Teil der Adresse: `/admin/mail/vorlagen/<slug>`. System hat keine eigene Adresse — es ist die Vorlagenseite selbst. */
export const KATEGORIE_ADRESSE: Record<Exclude<MailKategorie, "system">, string> = {
  speaker: "speaker",
  partner: "partner",
  participant: "teilnehmer",
  volunteer: "volunteers",
};

export function kategorieAusAdresse(slug: string): Exclude<MailKategorie, "system"> | null {
  const treffer = (Object.entries(KATEGORIE_ADRESSE) as [Exclude<MailKategorie, "system">, string][]).find(([, s]) => s === slug);
  return treffer ? treffer[0] : null;
}

export function istMailKategorie(wert: string | undefined | null): wert is MailKategorie {
  return (MAIL_KATEGORIEN as readonly string[]).includes(wert ?? "");
}
