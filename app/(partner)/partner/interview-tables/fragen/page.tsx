import { requireArea } from "@/lib/auth";
import { FormatUnterseite } from "../../FormatUnterseite";

export const dynamic = "force-dynamic";

/** Fragen — Interview Tables (PART-082), vierter Reiter. Bei mehreren Tischen (QS-079) die des gewählten (`?instanz=`). */
export default async function PartnerInterviewTablesQuestionsPage({ searchParams }: { searchParams: Promise<{ instanz?: string | string[] }> }) {
  await requireArea("partner", "/partner/interview-tables/fragen");
  const { instanz } = await searchParams;
  return <FormatUnterseite format="interview_table" ansicht="fragen" instanz={instanz} />;
}
