import { requireArea } from "@/lib/auth";
import { FormatUnterseite } from "../../FormatUnterseite";

export const dynamic = "force-dynamic";

/** Teilnehmende — Side-Event (PART-082), dritter Reiter. */
export default async function PartnerSideEventParticipantsPage() {
  await requireArea("partner", "/partner/side-event/teilnehmende");
  return <FormatUnterseite format="side_event" ansicht="teilnehmende" />;
}
