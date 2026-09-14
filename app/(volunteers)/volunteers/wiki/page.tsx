import { requireArea } from "@/lib/auth";
import { WikiPage } from "@/components/wiki/WikiPage";

export const dynamic = "force-dynamic";

/**
 * Volunteer-Wiki. `?rolle=` zeigt zusätzlich die Rollen-Seiten dieses
 * Bereichs — Artikel ohne Rollen gelten immer.
 */
export default async function VolunteerWikiPage({
  searchParams,
}: {
  searchParams: Promise<{ rolle?: string }>;
}) {
  await requireArea("volunteers", "/volunteers/wiki");
  const { rolle } = await searchParams;
  return <WikiPage audience="volunteer" locale="de" role={rolle ?? null} />;
}
