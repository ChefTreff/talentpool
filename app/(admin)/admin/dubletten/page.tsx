import { redirect } from "next/navigation";
import { requireAdminSection } from "@/lib/auth";

/**
 * Die Dubletten sind seit ADM-098 eine Unterseite der Personen (`/admin/personen/dubletten`). Die alte Adresse bleibt für
 * gemerkte Links und den Menüpunkt; den Statusfilter nimmt sie mit. Wer den Abschnitt nicht öffnen darf, bekommt wie immer 404.
 */
export default async function DublettenUmleitung({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminSection("duplicates", "/admin/dubletten");
  const { status } = await searchParams;
  redirect(status ? `/admin/personen/dubletten?status=${encodeURIComponent(status)}` : "/admin/personen/dubletten");
}
