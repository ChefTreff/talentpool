import { PipelineSeite } from "./PipelineSeite";

export const dynamic = "force-dynamic";

/** Die Pipeline: Ansprache bis zur Zusage (LEAD-028). */
export default async function SpeakerLeadsPage() {
  return <PipelineSeite ansicht="pipeline" path="/speaker-leads" />;
}
