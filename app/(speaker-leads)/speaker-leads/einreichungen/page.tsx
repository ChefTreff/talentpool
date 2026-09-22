import { requireArea } from "@/lib/auth";
import { EinreichungenSeite } from "@/components/einreichungen/EinreichungenSeite";

export const dynamic = "force-dynamic";

/** Einreichungen im Lead-Portal. Inhalt: `components/einreichungen`. */
export default async function SubmissionsPage() {
  await requireArea("speaker-leads", "/speaker-leads/einreichungen");
  return <EinreichungenSeite />;
}
