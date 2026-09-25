import { requireArea } from "@/lib/auth";
import { FormatUnterseite } from "../../FormatUnterseite";

export const dynamic = "force-dynamic";

/** Teilnehmende — Interview Tables (PART-082), dritter Reiter. */
export default async function PartnerInterviewTablesParticipantsPage() {
  await requireArea("partner", "/partner/interview-tables/teilnehmende");
  return <FormatUnterseite format="interview_table" ansicht="teilnehmende" />;
}
