import { redirect } from "next/navigation";
import { requireAdminSection } from "@/lib/auth";

/** Alte Adresse der Zusammenführungs-Vorschau (ADM-098): bleibt, damit gemerkte Links nicht brechen. */
export default async function ZusammenfuehrenUmleitung({
  searchParams,
}: {
  searchParams: Promise<{ bleibt?: string; geht?: string }>;
}) {
  await requireAdminSection("duplicates", "/admin/dubletten/zusammenfuehren");
  const { bleibt, geht } = await searchParams;
  const q = new URLSearchParams();
  if (bleibt) q.set("bleibt", bleibt);
  if (geht) q.set("geht", geht);
  redirect(`/admin/personen/dubletten/zusammenfuehren${q.size > 0 ? `?${q}` : ""}`);
}
