import { requireArea } from "@/lib/auth";
import { FormatUnterseite } from "../../FormatUnterseite";

export const dynamic = "force-dynamic";

/** Teilnehmende — Interview Tables (PART-082), dritter Reiter. Bei mehreren Tischen (QS-079) die des gewählten (`?instanz=`). */
export default async function PartnerInterviewTablesParticipantsPage({ searchParams }: { searchParams: Promise<{ instanz?: string | string[] }> }) {
  await requireArea("partner", "/partner/interview-tables/teilnehmende");
  const { instanz } = await searchParams;
  return <FormatUnterseite format="interview_table" ansicht="teilnehmende" instanz={instanz} />;
}
