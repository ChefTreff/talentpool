import { redirect } from "next/navigation";
import { requireAdminSection } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * ADM-072: die Freigabe der Slots wohnt jetzt in der zentralen Freigabe-Übersicht
 * (`/admin/einreichungen`, Reiter „Slots“) — zusammen mit Titeln und Beschreibungen,
 * Reisekosten, Hotel und Shuttle. Die alte Adresse bleibt als Weiterleitung, damit
 * Lesezeichen und Mails nicht ins Leere laufen. Den Ladecode hat
 * `components/programme/loadFreigabe.ts` übernommen.
 *
 * Das Abschnitts-Gate bleibt davor: wer den Programmteil nicht betreten darf,
 * bekommt weiter 404 und keine Weiterleitung (`tests/admin-sections.test.ts`).
 */
export default async function ProgrammeReleaseRedirect() {
  await requireAdminSection("programme", "/admin/programm/freigabe");
  redirect("/admin/einreichungen?art=slots");
}
