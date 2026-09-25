import { PipelineSeite } from "../PipelineSeite";

export const dynamic = "force-dynamic";

/** Bestätigte Speaker: das Onboarding nach der Zusage (LEAD-028). */
export default async function BestaetigteSpeakerPage() {
  return <PipelineSeite ansicht="bestaetigt" path="/speaker-leads/bestaetigt" />;
}
