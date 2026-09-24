import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/Button";
import { HeroBand } from "@/components/ui/HeroBand";
import { PhotoCard } from "@/components/ui/PhotoCard";

export const dynamic = "force-dynamic";

/**
 * „Home" — die allgemeine Startseite des Teilnehmer-Portals (TAL-005, D11,
 * Konrad 24.09.2026).
 *
 * Das Portal ist das Front-End des Talent-CRM und gilt übergreifend, nicht
 * nur für den Summit. Deshalb beginnt es nicht mehr auf der Summit-Seite
 * (die heißt jetzt `/summit` und steht in der Seitengruppe „Summit 2027"),
 * sondern hier: wer bin ich, was gibt es, wo geht es weiter. Weitere Formate
 * (Community-Events, Bootcamp) kommen als eigene Gruppen dazu, „Next Up" und
 * die Volunteer-Kachel mit TAL-006.
 *
 * **Dieselbe Weiche wie `/profil`:** ohne Onboarding geht es dorthin.
 */
export default async function TalentHomePage() {
  const user = await requireUser("/start");
  const { t } = await getI18n();

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("claim_or_create_person");

  const { data: person } = await supabase
    .from("person")
    .select("first_name,last_name")
    .maybeSingle();

  if (!person?.first_name?.trim() || !person?.last_name?.trim()) {
    redirect("/onboarding");
  }

  const vorname = person.first_name.trim();

  return (
    <>
      <HeroBand
        eyebrow={t.areas.talent.portal}
        title={t.talentStart.greeting.replace("{name}", vorname)}
        highlight={t.talentStart.greetingHighlight}
        lead={t.talentHome.lead}
        action={<ButtonLink href="/summit">{t.talentHome.action}</ButtonLink>}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <PhotoCard
          word={t.talentHome.cardSummitWord}
          title={t.talentSummit.groupLabel}
          description={t.talentHome.cardSummitBody}
          action={
            <ButtonLink href="/summit" variant="secondary" size="sm">
              {t.talentHome.cardSummitAction}
            </ButtonLink>
          }
        />
        <PhotoCard
          word={t.talentStart.cardProfileWord}
          title={t.profile.title}
          description={t.talentStart.cardProfileBody}
          action={
            <ButtonLink href="/profil" variant="secondary" size="sm">
              {t.talentStart.cardProfileAction}
            </ButtonLink>
          }
        />
      </div>

      <p className="ct-help mt-8">
        {t.talentStart.loggedInAs} <strong className="text-ink">{user.email}</strong>
      </p>
    </>
  );
}
