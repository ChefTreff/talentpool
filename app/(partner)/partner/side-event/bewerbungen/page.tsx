import { requireArea } from "@/lib/auth";
import { FormatUnterseite } from "../../FormatUnterseite";

export const dynamic = "force-dynamic";

/** Bewerbungen — Side-Event (PART-082), zweiter Reiter. */
export default async function PartnerSideEventApplicationsPage() {
  await requireArea("partner", "/partner/side-event/bewerbungen");
  return <FormatUnterseite format="side_event" ansicht="bewerbungen" />;
}
