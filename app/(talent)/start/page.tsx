import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/Button";
import { HeroBand, BandStat } from "@/components/ui/HeroBand";
import { PhotoCard } from "@/components/ui/PhotoCard";

export const dynamic = "force-dynamic";

/**
 * Die Startseite des Teilnehmer-Portals — eine **Menüseite**: was kann ich
 * hier tun, und wo fange ich an (Konrad, 22.09.2026).
 *
 * Bis dahin begann das Portal auf `/profil` (Entscheidung F8.4, „keine eigene
 * Übersicht"). Das hiess: Wer sich anmeldete, landete in einem Formular und
 * musste raten, dass es daneben noch Programm und Anmeldungen gibt. Jedes
 * andere Portal hat eine Übersicht; dieses hatte als einziges keine.
 *
 * Die drei Wege stehen als `PhotoCard` — der Baustein aus dem Detail-Block
 * der Website, gemacht für „Dinge, die man einmal liest und dann nicht mehr".
 * Genau das ist eine Menüseite. Als Zeilenliste wäre sie richtig, wenn es
 * zehn Einträge wären; bei dreien ist die Kartenform die, die einlädt.
 *
 * **Dieselbe Weiche wie `/profil`:** Wer das Onboarding nicht hinter sich
 * hat, wird dorthin geschickt. Eine Menüseite mit vier Wegen, von denen drei
 * erst nach dem Onboarding etwas zeigen, wäre eine Sackgasse mit Aussicht.
 */
export default async function TalentStartPage() {
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

  // Woran man gerade dran ist. **Dieselben Quellen wie `/meine`**, nicht
  // eigene Abfragen: `my_applications()` maskiert Entscheidungen bis zur
  // Freigabe, und `registration` ist die Tabelle dahinter. Hier etwas
  // Eigenes zu zählen hiesse, dass Übersicht und Detailseite verschiedene
  // Zahlen zeigen können.
  const [{ data: bewerbungen }, { count: anmeldungen }] = await Promise.all([
    supabase.rpc("my_applications"),
    supabase
      .from("registration")
      .select("id", { count: "exact", head: true })
      .not("session_id", "is", null),
  ]);
  const laufend = ((bewerbungen as unknown[] | null)?.length ?? 0) + (anmeldungen ?? 0);

  const vorname = person.first_name.trim();

  return (
    <>
      <HeroBand
        eyebrow={t.areas.talent.portal}
        title={t.talentStart.greeting.replace("{name}", vorname)}
        highlight={t.talentStart.greetingHighlight}
        lead={t.talentStart.lead}
        action={<ButtonLink href="/programm">{t.talentStart.action}</ButtonLink>}
        aside={
          <BandStat
            value={String(laufend)}
            label={t.talentStart.statLabel}
            hint={laufend > 0 ? t.talentStart.statHint : t.talentStart.statNone}
          />
        }
      />

      <div className="grid gap-6 sm:grid-cols-3">
        <PhotoCard
          word={t.talentStart.cardProgrammeWord}
          title={t.programme.title}
          description={t.talentStart.cardProgrammeBody}
          action={
            <ButtonLink href="/programm" variant="secondary" size="sm">
              {t.talentStart.cardProgrammeAction}
            </ButtonLink>
          }
        />
        <PhotoCard
          word={t.talentStart.cardMineWord}
          title={t.participation.title}
          description={t.talentStart.cardMineBody}
          action={
            <ButtonLink href="/meine" variant="secondary" size="sm">
              {t.talentStart.cardMineAction}
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
