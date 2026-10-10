import { requireArea } from "@/lib/auth";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { profilFelderAus } from "@/components/partner/profil";
import { ladeHiring } from "@/lib/partner/hiring-laden";
import type { RueckgabeTexte } from "../Rueckgabe";
import type { PartnerSpeaker } from "../talk/types";
import { ladeMasterclass } from "./daten";
import { Instanz } from "./Instanz";
import { MasterclassKopf } from "./MasterclassKopf";

export const dynamic = "force-dynamic";

/**
 * Masterclass (PART-045). Die Seite erscheint bei gebuchtem Produkt
 * `format_key = 'masterclass'`.
 *
 * Das Team vergibt Session und Slot; den Inhalt legt der Partner selbst an —
 * Titel, Beschreibung, Sprache und wer spricht, wie beim Talk (Konrad 17.09.).
 * Speaker kommen über denselben Weg wie dort (`partner_add_speaker`, eigener
 * Zugang oder verwaltet, PART-091). Bewerbungen, Teilnehmende und die
 * Bewerbungsfragen stehen in den weiteren Reitern.
 *
 * Unter jedem Inhalt die Frage nach Goodies (PART-054): die Antwort sieht das
 * Team im Admin beim Partner und hält nach.
 *
 * **Mehrere Masterclasses (QS-079, Konrad 09.10.2026: „bitte global immer so handhaben“):** vorher
 * stand jedes Formular je Masterclass untereinander, doppelt. Jetzt wählt ein Umschalter über den
 * Reitern die Masterclass (`?instanz=<id>`), und darunter steht **genau eine** mit Inhalt, Goodies und
 * „Wer spricht“ (`Instanz`). Die Seite lädt und zeichnet nur die gewählte; bei einer Masterclass gibt es
 * keinen Umschalter, die Seite ist wie vorher.
 */
export default async function PartnerMasterclassPage({ searchParams }: { searchParams: Promise<{ instanz?: string | string[] }> }) {
  await requireArea("partner", "/partner/masterclass");
  const { instanz } = await searchParams;
  const { supabase, locale, t, current, sessions, gewaehlt, instanzen, gebucht, canEdit } = await ladeMasterclass(instanz);
  const s = t.partnerMasterclass;
  const args = { p_org_id: current.org_id, p_edition_id: current.edition_id };
  const [vocab, { data: speakerZeilen }, { data: kontaktZeilen }, hiring] = await Promise.all([
    loadVocabMap(supabase, locale),
    supabase.rpc("partner_speakers", args),
    supabase.rpc("partner_contacts", { p_org_id: current.org_id }),
    // K-94 Stufe 2b (PART-140): „Aus ‚Wen sucht ihr?‘ übernehmen“ im Wunschprofil der Masterclass.
    ladeHiring(supabase, current.org_id, current.edition_id),
  ]);
  const speakers = (speakerZeilen ?? []) as PartnerSpeaker[];
  const ops = ((kontaktZeilen ?? []) as { first_name: string | null; last_name: string | null; roles: string[] | null }[])
    .find((k) => (k.roles ?? []).includes("primary_ops"));
  const opsName = ops ? [ops.first_name, ops.last_name].filter(Boolean).join(" ") || null : null;
  const sprachen = Object.entries(vgroup(vocab, "language"))
    .filter(([key]) => key === "de" || key === "en")
    .map(([value, label]) => ({ value, label }));
  const rueckgabe: RueckgabeTexte = { badge: t.partner.returnedBadge, title: t.partner.returnedTitle, next: t.partner.returnedNext };

  return (
    <>
      <MasterclassKopf gebucht={gebucht} sessions={sessions.length} instanzen={instanzen} word={t.partner.wordInvitation} t={s} b={t.partnerBewerbung} />
      {gewaehlt && (
        <Instanz
          key={gewaehlt.id}
          x={gewaehlt}
          speakers={speakers.filter((sp) => sp.session_id === gewaehlt.id)}
          canEdit={canEdit}
          opsName={opsName}
          locale={locale}
          dateLocale={t.meta.dateLocale}
          sprachen={sprachen}
          profilFelder={profilFelderAus((name) => vgroup(vocab, name))}
          hiring={{ eintraege: hiring, t: t.partnerHiring, leerHref: "/partner/onboarding#hiring" }}
          profilT={t.partnerTour as unknown as Record<string, string>}
          statusLabel={vgroup(vocab, "publish_status")}
          rueckgabe={rueckgabe}
          s={s}
          talk={t.partnerTalk as unknown as Record<string, string>}
          unsaved={t.common.unsaved}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
