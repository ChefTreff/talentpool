import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { HeroBand } from "@/components/ui/HeroBand";
import { HackView } from "./HackView";
import type { HackChallenge, LeaderboardRow, MyHack } from "./types";

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

  const [{ data: mine }, vocab, { data: challenges }] = await Promise.all([
    supabase.rpc("my_hack", { p_language: locale }),
    loadVocabMap(supabase, locale),
    supabase.rpc("hack_challenges", { p_language: locale }),
  ]);
  const data = (mine ?? { edition_id: null, application: null, team: null, challenge: null, submission: null }) as MyHack;

  // Metrik-Challenge des eigenen Teams (HACK-009): Auswertungsart aus der
  // Challenge-Liste, der eigene Wert aus dem Leaderboard (is_mine).
  const meine = ((challenges ?? []) as HackChallenge[]).find((c) => c.id === data.challenge?.id) ?? null;
  let metric: { label: string; value: number | null; confirmed: boolean } | null = null;
  if (meine?.judging_mode === "metric") {
    const { data: lb } = await supabase.rpc("hack_leaderboard", { p_challenge_id: meine.id });
    const eigene = ((lb ?? []) as LeaderboardRow[]).find((r) => r.is_mine) ?? null;
    metric = { label: meine.metric_label ?? t.hackathon.metric, value: eigene?.value ?? null, confirmed: eigene?.confirmed ?? false };
  }

  return (
    <>
      <HeroBand
        eyebrow={t.areas.hackathon.portal}
        title={t.hackathon.title}
        lead={t.hackathon.lead}
      />
      <HackView
        data={data}
        metric={metric}
        skills={vgroup(vocab, "hack_skill")}
        discordUrl={process.env.HACKATHON_DISCORD_URL?.trim() || null}
        t={t.hackathon}
        common={{ save: t.common.save, cancel: t.common.cancel }}
        rpcMessages={t.rpc}
      />
    </>
  );
}
