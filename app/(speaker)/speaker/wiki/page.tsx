import { requireArea } from "@/lib/auth";
import { WikiPage } from "@/components/wiki/WikiPage";

export const dynamic = "force-dynamic";

/** Speaker-Wiki: Englisch ist die Ausgangssprache des Bereichs. */
export default async function SpeakerWikiPage() {
  await requireArea("speaker", "/speaker/wiki");
  return <WikiPage audience="speaker" locale="en" />;
}
