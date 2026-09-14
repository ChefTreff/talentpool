import { requireArea } from "@/lib/auth";
import { WikiPage } from "@/components/wiki/WikiPage";

export const dynamic = "force-dynamic";

export default async function PartnerWikiPage() {
  await requireArea("partner", "/partner/wiki");
  return <WikiPage audience="partner" locale="de" />;
}
