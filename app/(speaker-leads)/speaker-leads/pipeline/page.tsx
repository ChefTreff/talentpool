import { PipelineSeite } from "../PipelineSeite";

export const dynamic = "force-dynamic";

/**
 * Die Pipeline: Ansprache bis zur Zusage (LEAD-028). Seit LEAD-024 unter
 * `/speaker-leads/pipeline` — die Wurzel des Portals ist die Übersicht, wie in
 * den anderen Portalen.
 */
export default async function SpeakerLeadsPipelinePage() {
  return <PipelineSeite ansicht="pipeline" path="/speaker-leads/pipeline" />;
}
