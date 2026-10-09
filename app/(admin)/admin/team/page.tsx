import { redirect } from "next/navigation";
import { requireAdminSection } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Das Team lebt seit ADM-094 in „Team & Zugänge“ (`/admin/verwaltung/zugaenge`, Filter „Team“). Die alte Adresse
 * bleibt als Weiterleitung, damit gemerkte Links und Lesezeichen nicht brechen. Das Gate steht trotzdem hier:
 * wer den Abschnitt nicht öffnen darf, erfährt auch nicht, wohin es geht.
 */
export default async function AdminTeamPage() {
  await requireAdminSection("access", "/admin/team");
  redirect("/admin/verwaltung/zugaenge");
}
