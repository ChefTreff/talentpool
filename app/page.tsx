import { getMyAreas, getSessionContext } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { AppHeader } from "@/components/layout/AppHeader";
import { ButtonLink } from "@/components/ui/Button";
import { landingPathFor } from "@/lib/areas";

export const dynamic = "force-dynamic";

export default async function Home() {
  const ctx = await getSessionContext();
  const { t } = await getI18n();
  // Der Knopf führt in den eigenen Bereich, nicht auf einen festen Pfad — sonst
  // landet eine Speakerin auf dem Teilnehmer-Profil (Feedback-Runde 1, Punkt 2).
  const target = ctx.user ? landingPathFor(await getMyAreas()) : "/login";

  return (
    <>
      <AppHeader />
      {/* Marken-Moment: Navy-Grund, Highlight-Wort in ExtraBold Italic + Akzent. */}
      <main id="content" className="flex flex-1 flex-col bg-navy text-on-navy">
        <div className="mx-auto flex w-full max-w-[800px] flex-1 flex-col justify-center gap-8 px-6 py-24">
          <div>
            <p className="ct-eyebrow text-on-navy-muted">{t.home.eyebrow}</p>
            <h1 className="ct-display mt-3">
              {t.home.titleLead}{" "}
              {/* Der Akzent trägt auf Navy keinen Text: #6262DC erreicht dort
                  3,56:1. Das Hervorheben übernimmt die kursive Auszeichnung,
                  die Farbe bleibt in der Ramp (accent-soft, 14,4:1). */}
              <em className="ct-highlight text-accent-soft">
                {t.home.titleHighlight}
              </em>
            </h1>
            <p className="ct-laica mt-5 max-w-[46ch] text-on-navy-muted">
              {t.home.lead}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {ctx.user ? (
              <ButtonLink href={target}>{t.home.profileCta}</ButtonLink>
            ) : (
              <ButtonLink href="/login">{t.home.loginCta}</ButtonLink>
            )}
            {ctx.user && (
              <span className="self-center ct-small text-on-navy-muted">
                {t.home.loggedInAs} {ctx.user.email}
              </span>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
