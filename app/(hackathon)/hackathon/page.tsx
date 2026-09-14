import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { HackView } from "./HackView";
import type { MyHack } from "./types";

export const dynamic = "force-dynamic";

/**
 * Teilnehmer-App (B7). Englisch ist die Ausgangssprache des Bereichs (E7).
 * Discord bleibt der Kommunikationskanal — das Portal verwaltet, was verwaltet
 * werden muss (E3).
 */
export default async function HackathonPage() {
  await requireArea("hackathon", "/hackathon");
  const { locale, t } = await getI18n("en");
  const supabase = await createSupabaseServerClient();

  const [{ data: mine }, vocab] = await Promise.all([
    supabase.rpc("my_hack"),
    loadVocabMap(supabase, locale),
  ]);

  return (
    <>
      <PageHeader title={t.hackathon.title} description={t.hackathon.lead} />
      <HackView
        data={(mine ?? { edition_id: null, application: null, team: null, challenge: null, submission: null }) as MyHack}
        skills={vgroup(vocab, "hack_skill")}
        discordUrl={process.env.HACKATHON_DISCORD_URL?.trim() || null}
        t={t.hackathon}
        common={{ save: t.common.save, cancel: t.common.cancel }}
        rpcMessages={t.rpc}
      />
    </>
  );
}
