import { requireAdminSection } from "@/lib/auth";
import { EinreichungenSeite } from "@/components/einreichungen/EinreichungenSeite";

export const dynamic = "force-dynamic";

/**
 * Dieselbe Seite im Admin-Bereich (Regel „Admin-Vollständigkeit", 22.09.).
 *
 * Nur das Bereichsgate ist ein anderes; wer was entscheiden darf, sagt
 * weiterhin die Datenbank.
 */
export default async function AdminSubmissionsPage() {
  await requireAdminSection("submissions", "/admin/einreichungen");
  return <EinreichungenSeite />;
}
