import { requireAnyAdminSection } from "@/lib/auth";
import { istMailKategorie } from "@/lib/mail/kategorien";
import { VorlagenSeite } from "./VorlagenSeite";

export const dynamic = "force-dynamic";

/**
 * Mail-Vorlagen bearbeiten — alle Kategorien, die die Person bearbeiten darf (ADM-102).
 *
 * Die Tür ist **irgendein** Vorlagen-Abschnitt: `admin` (Abschnitt `mail`) sieht alles, ein Partner-Team nur
 * Partner-Mails. Wer welche Vorlage ändern darf, entscheidet je Schlüssel die Datenbank
 * (`can_edit_mail_template`); `?kategorie=` filtert nur die Anzeige.
 */
export default async function MailVorlagenPage({ searchParams }: { searchParams: Promise<{ kategorie?: string }> }) {
  const ctx = await requireAnyAdminSection(
    ["mail", "mailSpeaker", "mailPartner", "mailParticipants", "mailVolunteers"],
    "/admin/mail/vorlagen",
  );
  const { kategorie } = await searchParams;
  return <VorlagenSeite kategorie={istMailKategorie(kategorie) ? kategorie : null} roleNames={ctx.roleNames} />;
}
