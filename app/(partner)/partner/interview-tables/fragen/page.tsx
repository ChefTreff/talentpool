import { requireArea } from "@/lib/auth";
import { FormatUnterseite } from "../../FormatUnterseite";

export const dynamic = "force-dynamic";

/** Fragen — Interview Tables (PART-082), vierter Reiter. */
export default async function PartnerInterviewTablesQuestionsPage() {
  await requireArea("partner", "/partner/interview-tables/fragen");
  return <FormatUnterseite format="interview_table" ansicht="fragen" />;
}
