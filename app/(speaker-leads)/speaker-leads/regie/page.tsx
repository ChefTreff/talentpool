import { requireArea } from "@/lib/auth";
import { RegieSeite } from "@/components/regie/RegieSeite";

export const dynamic = "force-dynamic";

const PATH = "/speaker-leads/regie";

/** Regie im Lead-Portal. Inhalt: `components/regie/RegieSeite`. */
export default async function LeadsRegiePage({
  searchParams,
}: {
  searchParams: Promise<{ buehne?: string; tag?: string }>;
}) {
  await requireArea("speaker-leads", PATH);
  const { buehne, tag } = await searchParams;
  return <RegieSeite buehne={buehne} tag={tag} />;
}
