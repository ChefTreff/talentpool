import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { herkunftNachProfil, LISTE_NEU } from "@/lib/neue-speaker";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { SpeakerListe } from "./SpeakerListe";
import { NeueSpeaker, type BuddyOption } from "./NeueSpeaker";
import type { AdminSpeakerRow, ContactOption, PartnerSpeakerRow, SpeakerManager } from "./types";

export const dynamic = "force-dynamic";

/**
 * Die vollständige Speaker-Liste. Dieselbe RPC wie im Lead-Portal — wer welche
 * Zeilen sieht, entscheidet `can_manage_speaker()`, und für die
 * Programmleitung schliesst das jeden ein.
 *
 * **Zwei Ansichten über Reiter** (ADM-084, wie bei den Freigaben): „Alle Speaker“ und „Neue Speaker“
 * (`?liste=neu`) — die von Partnern angelegten Speaker, bei denen Betreuung oder Stand noch fehlen. Die Herkunft kommt aus
 * `partner_created_speakers()` und markiert in der Hauptliste jede Zeile, die ein Partner angelegt hat. Fehlt die Funktion
 * (Migration noch nicht angewendet) oder verweigert sie die Liste, bleibt die Seite, wie sie war: keine Reiter, keine Marken.
 */
export default async function AdminSpeakerPage({ searchParams }: { searchParams: Promise<{ liste?: string }> }) {
  await requireAdminSection("speakers", "/admin/speaker");
  const { liste } = await searchParams;
  const { locale, t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const [{ data: rows }, { data: partnerRows, error: partnerFehler }, vocab] = await Promise.all([
    supabase.rpc("manager_speakers"),
    supabase.rpc("partner_created_speakers"),
    loadVocabMap(supabase, locale),
  ]);

  const speakers = (rows ?? []) as AdminSpeakerRow[];
  const partner = partnerFehler ? null : ((partnerRows ?? []) as PartnerSpeakerRow[]);
  const neue = (partner ?? []).filter((p) => p.is_new);
  const zeigeNeue = liste === LISTE_NEU && partner !== null;

  // Die Auswahllisten der Zuteilung nur laden, wenn die Liste auch gezeigt wird. Den Buddy darf setzen, wer die
  // Ansprechpartner der Edition pflegen darf — sonst verweigert `edition_contacts_admin` die Liste, und die Zeile zeigt den
  // Buddy als Text.
  let managers: SpeakerManager[] = [];
  let buddies: BuddyOption[] = [];
  let buddiesEditierbar = false;
  if (zeigeNeue) {
    const [{ data: managerRows }, { data: kontaktRows, error: kontaktFehler }] = await Promise.all([
      supabase.rpc("speaker_managers"),
      supabase.rpc("edition_contacts_admin"),
    ]);
    managers = (managerRows ?? []) as SpeakerManager[];
    buddiesEditierbar = !kontaktFehler && kontaktRows !== null;
    buddies = ((kontaktRows ?? []) as ContactOption[])
      .filter((k) => k.type === "speaker_buddy")
      .map((k) => ({ id: k.id, name: k.display_name }));
  }

  const ta = t.adminSpeaker;
  const reiter =
    partner === null
      ? null
      : [
          { href: "/admin/speaker", label: `${ta.viewAll} (${speakers.length})`, aktiv: !zeigeNeue },
          { href: `/admin/speaker?liste=${LISTE_NEU}`, label: `${ta.viewNew} (${neue.length})`, aktiv: zeigeNeue },
        ];

  return (
    <>
      <PageHeader
        word={t.admin.words.speakers}
        title={ta.title}
        description={`${ta.lead} · ${speakers.length} ${t.common.shown}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {/* LEAD-025: alle Notizen, Kontakte und Aufgaben der Edition an einem Ort. */}
            <ButtonLink href="/admin/speaker/verlauf" variant="secondary" size="sm">
              {t.speakerVerlauf.overviewLink}
            </ButtonLink>
            {/* SPK-046: freigegebene Speaker auf die Website (Sanity). */}
            <ButtonLink href="/admin/speaker/website" variant="ghost" size="sm">
              {t.adminSpeakerWebsite.link}
            </ButtonLink>
          </div>
        }
      />
      {reiter && <SectionTabs label={ta.viewsLabel} items={reiter} />}
      {zeigeNeue ? (
        <NeueSpeaker
          rows={neue}
          managers={managers}
          buddies={buddies}
          buddiesEditierbar={buddiesEditierbar}
          stand={vgroup(vocab, "speaker_pipeline")}
          dateLocale={t.meta.dateLocale}
          t={ta}
          rpcMessages={t.rpc}
        />
      ) : (
        <SpeakerListe
          rows={speakers}
          labels={{
            pipeline: vgroup(vocab, "speaker_pipeline"),
            speakerType: vgroup(vocab, "speaker_type"),
            declineReason: vgroup(vocab, "speaker_decline_reason"),
            priority: vgroup(vocab, "speaker_priority"),
            category: vgroup(vocab, "speaker_category"),
          }}
          dateLocale={t.meta.dateLocale}
          t={ta}
          te={t.speakerEinordnung}
          tg={t.speakerGast}
          herkunft={herkunftNachProfil(partner ?? [], ta.partnerFallback)}
        />
      )}
    </>
  );
}
