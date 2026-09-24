import { requireAdminSection } from "@/lib/auth";
import { RegieSeite } from "@/components/regie/RegieSeite";

export const dynamic = "force-dynamic";

const PATH = "/admin/regie";

/**
 * Dieselbe Regie im Admin-Bereich (Regel „Admin-Vollständigkeit", 22.09.).
 *
 * Nur das Bereichsgate ist ein anderes. Ein Admin sieht über `can_edit_stage()`
 * alle Bühnen, eine Stage Lead im Portal nur ihre — entschieden wird das in
 * der Datenbank, nicht hier.
 */
export default async function AdminRegiePage({
  searchParams,
}: {
  searchParams: Promise<{ buehne?: string; tag?: string }>;
}) {
  await requireAdminSection("regie", PATH);
  const { buehne, tag } = await searchParams;
  return <RegieSeite buehne={buehne} tag={tag} />;
}
