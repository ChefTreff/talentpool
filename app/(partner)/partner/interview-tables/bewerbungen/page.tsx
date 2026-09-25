import { requireArea } from "@/lib/auth";
import { FormatUnterseite } from "../../FormatUnterseite";

export const dynamic = "force-dynamic";

/** Bewerbungen — Interview Tables (PART-082), zweiter Reiter. */
export default async function PartnerInterviewTablesApplicationsPage() {
  await requireArea("partner", "/partner/interview-tables/bewerbungen");
  return <FormatUnterseite format="interview_table" ansicht="bewerbungen" />;
}
