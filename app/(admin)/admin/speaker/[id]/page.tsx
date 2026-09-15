import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { SpeakerDetailView } from "./Detail";
import type { ContactOption, SpeakerDetail, SpeakerManager } from "../types";

export const dynamic = "force-dynamic";

/**
 * Ein Speaker mit allem, was zu ihm gespeichert ist.
 *
 * Ein Aufruf statt sieben: `speaker_detail()` liefert Person, Profil, Reise,
 * Ansprechpartner und Sessions in einem Zug — inklusive der Auskunft, ob die
 * interne Notiz überhaupt mitkommt.
 */
export default async function AdminSpeakerDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Gate je Seite, nicht nur im Layout: Layouts rendern bei Client-Navigation
  // nicht neu.
  await requireArea("admin", `/admin/speaker/${id}`);
  const { locale, t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("speaker_detail", { p_profile_id: id });
  if (error || !data) notFound();
  const speaker = data as SpeakerDetail;

  const [{ data: managers }, { data: contacts }, vocab] = await Promise.all([
    supabase.rpc("speaker_managers"),
    supabase.rpc("edition_contacts_admin", { p_edition_id: speaker.edition_id }),
    loadVocabMap(supabase, locale),
  ]);

  return (
    <SpeakerDetailView
      speaker={speaker}
      managers={(managers ?? []) as SpeakerManager[]}
      contacts={(contacts ?? []) as ContactOption[]}
      labels={{
        pipeline: vgroup(vocab, "speaker_pipeline"),
        speakerType: vgroup(vocab, "speaker_type"),
        hospitality: vgroup(vocab, "hospitality_status"),
        hotelTier: vgroup(vocab, "hotel_tier"),
        passType: vgroup(vocab, "ticket_type"),
        declineReason: vgroup(vocab, "speaker_decline_reason"),
        travelMode: vgroup(vocab, "travel_mode"),
      }}
      dateLocale={t.meta.dateLocale}
      t={t.adminSpeaker}
      common={{
        cancel: t.common.cancel,
        choose: t.common.choose,
        none: t.common.none,
        save: t.common.save,
      }}
      rpcMessages={t.rpc}
    />
  );
}
