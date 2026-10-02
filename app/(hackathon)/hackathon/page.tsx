import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { HeroBand } from "@/components/ui/HeroBand";
import { abgabeUrls, datasetUrl, type AbgabeZeile } from "@/lib/hackathon/datensatz-server";
import type { AbgabeDatei } from "@/components/hackathon/AbgabeDateien";
import { HackView } from "./HackView";
import type { Beitrittsanfrage, HackChallenge, LeaderboardRow, MyHack, OffenesTeam, SuchendePerson } from "./types";
import { Teamsuche } from "@/components/hackathon/Teamsuche";

export const dynamic = "force-dynamic";

/**
 * Teilnehmer-App (B7). Englisch ist die Ausgangssprache des Bereichs (E7).
 * Discord bleibt der Kommunikationskanal — das Portal verwaltet, was verwaltet
 * werden muss (E3).
 */
export default async function HackathonPage() {
  const { personId: me } = await requireArea("hackathon", "/hackathon");
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

  // Datensatz der eigenen Challenge (HACK-012): nur Teams dieser Challenge
  // bekommen ihn (Leserolle + Bucket-Policy), alle anderen sehen nichts.
  let dataset: { filename: string; size_bytes: number | null; url: string | null } | null = null;
  if (data.team && data.challenge) {
    const { data: ds } = await supabase.rpc("hack_challenge_dataset", { p_challenge_id: data.challenge.id });
    const row = ((ds ?? []) as { storage_path: string; filename: string; size_bytes: number | null }[])[0];
    if (row) dataset = { filename: row.filename, size_bytes: row.size_bytes, url: await datasetUrl(supabase, row.storage_path, row.filename) };
  }

  // Dateien der eigenen Abgabe (HACK-011), signiert mit der eigenen Sitzung.
  let abgabe: AbgabeDatei[] = [];
  if (data.team) {
    const { data: rows } = await supabase.rpc("hack_submission_files", { p_team_id: data.team.id });
    const zeilen = (rows ?? []) as AbgabeZeile[];
    const urls = await abgabeUrls(supabase, zeilen);
    abgabe = zeilen.map((z) => ({ file_id: z.file_id, filename: z.filename, size_bytes: z.size_bytes, late: z.late, url: urls.get(z.storage_path) ?? null }));
  }

  // Teamsuche (HACK-016): nur für angenommene Bewerbungen. Ohne Team die offenen
  // Teams, im Team die Personen mit „suche Team“; dazu die eigenen Anfragen.
  let suche: React.ComponentProps<typeof Teamsuche> | null = null;
  if (data.application?.status === "accepted") {
    const ichKapitaen = data.team?.members.some((m) => m.is_captain && m.person_id === me) ?? false;
    const [{ data: teamRows }, { data: peopleRows }, { data: requestRows }] = await Promise.all([
      supabase.rpc("hack_team_search", { p_language: locale }),
      data.team ? supabase.rpc("hack_people_search") : Promise.resolve({ data: [] }),
      supabase.rpc("my_hack_requests"),
    ]);
    const teams = (teamRows ?? []) as OffenesTeam[];
    const eigenes = data.team ? teams.find((x) => x.team_id === data.team!.id) ?? null : null;
    suche = {
      modus: data.team ? (ichKapitaen ? "kapitaen" : "mitglied") : "solo",
      seeking: data.application.seeking_team ?? false,
      teams: data.team ? [] : teams,
      people: (peopleRows ?? []) as SuchendePerson[],
      requests: (requestRows ?? []) as Beitrittsanfrage[],
      myTeam: data.team ? { looking: Boolean(eigenes), skills: eigenes?.looking_skills ?? [], note: eigenes?.looking_note ?? "" } : null,
      labels: { skills: vgroup(vocab, "hack_skill"), studyFields: vgroup(vocab, "study_field"), tracks: vgroup(vocab, "hack_track") },
      t: t.hackSearch,
      rpcMessages: t.rpc,
    };
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
        dataset={dataset}
        abgabe={abgabe}
        teamsuche={suche ? <Teamsuche {...suche} /> : null}
        skills={vgroup(vocab, "hack_skill")}
        tracks={vgroup(vocab, "hack_track")}
        discordUrl={process.env.HACKATHON_DISCORD_URL?.trim() || null}
        t={t.hackathon}
        common={{ save: t.common.save, cancel: t.common.cancel }}
        rpcMessages={t.rpc}
      />
    </>
  );
}
