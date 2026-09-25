import { requireArea } from "@/lib/auth";
import { FormatUnterseite } from "../../FormatUnterseite";

export const dynamic = "force-dynamic";

/** Fragen — Side-Event (PART-082), vierter Reiter. */
export default async function PartnerSideEventQuestionsPage() {
  await requireArea("partner", "/partner/side-event/fragen");
  return <FormatUnterseite format="side_event" ansicht="fragen" />;
}
