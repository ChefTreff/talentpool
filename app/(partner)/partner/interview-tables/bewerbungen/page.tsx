import { requireArea } from "@/lib/auth";
import { FormatUnterseite } from "../../FormatUnterseite";

export const dynamic = "force-dynamic";

/** Bewerbungen — Interview Tables (PART-082), zweiter Reiter. Bei mehreren Tischen (QS-079) die des gewählten (`?instanz=`). */
export default async function PartnerInterviewTablesApplicationsPage({ searchParams }: { searchParams: Promise<{ instanz?: string | string[] }> }) {
  await requireArea("partner", "/partner/interview-tables/bewerbungen");
  const { instanz } = await searchParams;
  return <FormatUnterseite format="interview_table" ansicht="bewerbungen" instanz={instanz} />;
}
