import { notFound } from "next/navigation";
import { requireAdminSection } from "@/lib/auth";
import { KATEGORIE_ABSCHNITT, KATEGORIE_ADRESSE, kategorieAusAdresse } from "@/lib/mail/kategorien";
import { VorlagenSeite } from "../VorlagenSeite";

export const dynamic = "force-dynamic";

/**
 * Die Vorlagen **eines Bereichs** (ADM-102): `/admin/mail/vorlagen/speaker`, `/partner`, `/teilnehmer`, `/volunteers`.
 * Eigene Adresse und eigener Abschnitt je Bereich, damit ein Partner-Manager hier landet, ohne dass es dafür schon einen
 * Menüpunkt braucht (der folgt mit dem Design-Vorschlag ADM-089). Eine unbekannte Adresse ist eine 404.
 */
export default async function MailVorlagenBereichPage({ params }: { params: Promise<{ kategorie: string }> }) {
  const { kategorie: slug } = await params;
  const kategorie = kategorieAusAdresse(slug);
  if (!kategorie) notFound();
  const ctx = await requireAdminSection(KATEGORIE_ABSCHNITT[kategorie], `/admin/mail/vorlagen/${KATEGORIE_ADRESSE[kategorie]}`);
  return <VorlagenSeite kategorie={kategorie} roleNames={ctx.roleNames} />;
}
