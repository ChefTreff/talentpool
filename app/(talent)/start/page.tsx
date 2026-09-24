import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/Button";
import { HeroBand } from "@/components/ui/HeroBand";
import { PhotoCard } from "@/components/ui/PhotoCard";
import { neuesFenster } from "@/components/ui/neues-fenster";
import { VolunteerInvite } from "../meine/VolunteerInvite";
import type { VolunteerProfile } from "@/app/(volunteers)/volunteers/types";

type NextUp = {
  id: string;
  word_de: string | null;
  word_en: string | null;
  title_de: string;
  title_en: string | null;
  teaser_de: string | null;
  teaser_en: string | null;
  link_url: string | null;
  starts_at: string | null;
};

export const dynamic = "force-dynamic";

/**
 * „Home" — die allgemeine Startseite des Teilnehmer-Portals (TAL-005, D11,
 * Konrad 24.09.2026).
 *
 * Das Portal ist das Front-End des Talent-CRM und gilt übergreifend, nicht
 * nur für den Summit. Deshalb beginnt es nicht mehr auf der Summit-Seite
 * (die heißt jetzt `/summit` und steht in der Seitengruppe „Summit 2027"),
 * sondern hier: wer bin ich, was gibt es, wo geht es weiter. Weitere Formate
 * (Community-Events, Bootcamp) kommen als eigene Gruppen dazu.
 *
 * **Next Up** (TAL-006, Konrad: „ein super Marketing-Kanal"): Hinweise auf
 * kommende Events und Programme, gepflegt im Admin unter `/admin/next-up`.
 * Ohne Einträge fällt die Sektion weg — ein leerer Kasten auf der Startseite
 * jeder Person wäre schlechter als keiner. Darunter die Kachel
 * **„Du willst dabei sein?"** zur Volunteer-Bewerbung (dieselbe Logik wie auf
 * `/meine`: nach Zusage führt sie zu den Schichten, nach Absage fehlt sie).
 *
 * **Dieselbe Weiche wie `/profil`:** ohne Onboarding geht es dorthin.
 */
export default async function TalentHomePage() {
  const user = await requireUser("/start");
  const { locale, t } = await getI18n();

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

  // Beide Quellen dürfen fehlen (Migration v6_next_up noch nicht live, kein
  // Volunteer-Profil) — Home zeigt dann einfach weniger.
  const [{ data: nextUpRows }, { data: volunteerJson }] = await Promise.all([
    supabase.rpc("next_up_items"),
    supabase.rpc("my_volunteer_profile"),
  ]);
  const nextUp = (nextUpRows ?? []) as NextUp[];
  const en = locale === "en";
  const pick = (de: string | null, eng: string | null) => (en ? (eng ?? de) : (de ?? eng)) ?? "";
  const dateFmt = new Intl.DateTimeFormat(en ? "en-GB" : "de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });

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

      {nextUp.length > 0 && (
        <section aria-labelledby="next-up" className="mt-10">
          <h2 id="next-up" className="ct-h2 mb-4 text-ink">
            {t.talentHome.nextUpTitle}
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {nextUp.map((n) => {
              const extern = n.link_url?.startsWith("https://") ?? false;
              const datum = n.starts_at ? dateFmt.format(new Date(n.starts_at)) : null;
              const teaser = pick(n.teaser_de, n.teaser_en);
              return (
                <PhotoCard
                  key={n.id}
                  word={pick(n.word_de, n.word_en) || t.talentHome.nextUpWord}
                  title={pick(n.title_de, n.title_en)}
                  description={[datum, teaser].filter(Boolean).join(" · ")}
                  action={
                    n.link_url ? (
                      <ButtonLink
                        href={n.link_url}
                        variant="secondary"
                        size="sm"
                        {...(extern ? neuesFenster : {})}
                      >
                        {t.talentHome.nextUpAction}
                      </ButtonLink>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      <div className="mt-10">
        <VolunteerInvite
          status={((volunteerJson ?? null) as VolunteerProfile | null)?.status ?? null}
          t={{ ...t.volunteers, inviteTitle: t.talentHome.volunteerTitle }}
        />
      </div>

      <p className="ct-help mt-8">
        {t.talentStart.loggedInAs} <strong className="text-ink">{user.email}</strong>
      </p>
    </>
  );
}
