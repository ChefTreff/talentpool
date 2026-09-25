import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SidebarShell } from "@/components/layout/SidebarShell";
import { CONSENT_VERSION } from "@/lib/consent";
import { EinwilligungsGate } from "./EinwilligungsGate";
import { ProfilWechsler } from "./ProfilWechsler";
import { SPEAKER_CONSENTS, type SpeakerProfile } from "./speaker/types";

export const dynamic = "force-dynamic";

/**
 * Speaker-Portal für `speaker` und `speaker_assistant`.
 *
 * Englisch ist die Ausgangssprache (Entscheidungslog 10.09.): `getI18n("en")`
 * greift nur, wenn die Person keine Sprache gewählt hat — Profilsprache und
 * Umschalter gewinnen immer.
 */
export default async function SpeakerLayout({ children }: { children: ReactNode }) {
  await requireArea("speaker");
  const { t } = await getI18n("en");

  // Wer keine Reisekosten erstattet bekommt, sieht den Punkt gar nicht erst
  // (SPK-031). Eine Seite, die nur sagt „das gilt nicht für dich", weckt
  // Erwartungen und beantwortet keine Frage. Die Seite selbst prüft es noch
  // einmal — ein Menü ist keine Rechtegrenze.
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("my_speaker_profile");
  const profile = (data ?? null) as SpeakerProfile | null;
  const zeigeReisekosten = profile?.travel_costs_covered === true;

  // --- Profilwahl (SPK-071) ---------------------------------------------------
  // Wer für mehrere Speaker arbeitet (eigenes Profil plus Assistenz oder Kontakt
  // eines Partners), wählt oben in der Leiste, für wen. Bei einem Profil steht
  // da nichts. Die Edition erscheint nur, wenn es mehrere gibt.
  const { data: profilZeilen } = await supabase.rpc("my_speaker_profiles");
  const profilListe = ((profilZeilen ?? []) as {
    profile_id: string;
    edition_name: string | null;
    first_name: string | null;
    last_name: string | null;
    own: boolean;
    selected: boolean;
  }[]);
  const mehrereEditionen = new Set(profilListe.map((p) => p.edition_name)).size > 1;
  const wahl = profilListe.map((p) => {
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";
    const wer = p.own ? t.speaker.profileOwn.replace("{name}", name) : name;
    return { id: p.profile_id, label: mehrereEditionen && p.edition_name ? `${wer} · ${p.edition_name}` : wer };
  });
  const gewaehlt = profilListe.find((p) => p.selected)?.profile_id ?? profilListe[0]?.profile_id ?? "";

  // --- Einwilligung beim ersten Anmelden (SPK-024) --------------------------
  // Gefragt wird, solange **nicht jede** der vier Einwilligungen in der
  // geltenden Fassung beantwortet ist. Geprüft wird die Fassung mit, nicht nur
  // das Vorhandensein: ändert sich der Text, ist die alte Zustimmung eine
  // Zustimmung zu etwas anderem. `consent_current` liest die Person selbst,
  // dafür braucht es keine eigene RPC — und keinen Filter auf die Person:
  // die Policy `cr_self_sel` auf `consent_record` lässt ohnehin nur die
  // eigenen Zeilen durch, die Sicht ist `security_invoker`.
  //
  // **Die Assistenz wird nicht gefragt** — sie darf keine Einwilligung geben
  // (Antwort 58). Ein Dialog, den sie nicht erfüllen kann, wäre eine Aussperrung.
  let fehlendeEinwilligung = false;
  if (profile && !profile.is_assistant) {
    const { data: rows } = await supabase
      .from("consent_current")
      .select("consent_type, version")
      .in("consent_type", [...SPEAKER_CONSENTS]);
    const beantwortet = new Set(
      ((rows ?? []) as { consent_type: string; version: string }[])
        .filter((r) => r.version === CONSENT_VERSION)
        .map((r) => r.consent_type),
    );
    fehlendeEinwilligung = SPEAKER_CONSENTS.some((k) => !beantwortet.has(k));
  }

  return (
    <SidebarShell
      area="speaker"
      label={t.areas.speaker.portal}
      rootHref="/speaker"
      locale="en"
      header={
        <ProfilWechsler profile={wahl} currentId={gewaehlt} label={t.speaker.profileSwitch} rpcMessages={t.rpc} />
      }
      groups={[
        {
          label: "",
          items: [
            { href: "/speaker", label: t.speaker.navOverview },
            { href: "/speaker/session", label: t.speaker.navSession },
            { href: "/speaker/travel", label: t.speaker.navTravel },
            { href: "/speaker/tickets", label: t.speaker.navTickets },
            ...(zeigeReisekosten
              ? [{ href: "/speaker/reisekosten", label: t.speaker.navExpenses }]
              : []),
            { href: "/speaker/media", label: t.speaker.navMedia },
            { href: "/speaker/grafik", label: t.speaker.navGraphic },
            { href: "/speaker/profil", label: t.speaker.navProfile },
            { href: "/speaker/wiki", label: t.speaker.navWiki },
          ],
        },
      ]}
    >
      {children}
      {fehlendeEinwilligung && (
        <EinwilligungsGate
          keys={SPEAKER_CONSENTS.map((key) => ({
            key,
            label: (t.speaker as Record<string, string>)[CONSENT_LABEL[key]] ?? key,
          }))}
          t={{
            title: t.speaker.consentGateTitle,
            lead: t.speaker.consentGateLead,
            freeChoice: t.speaker.consentGateFreeChoice,
            submit: t.speaker.consentGateSubmit,
          }}
          rpcMessages={t.rpc}
        />
      )}
    </SidebarShell>
  );
}

/** Einwilligungsschlüssel → Textschlüssel im Wörterbuch. */
const CONSENT_LABEL: Record<string, string> = {
  photo_video: "consentPhotoVideo",
  speaker_release: "consentSpeakerRelease",
  slides_publication: "consentSlides",
  hospitality_data: "consentHospitality",
};
