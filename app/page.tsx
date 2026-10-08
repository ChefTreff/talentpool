import { redirect } from "next/navigation";
import { getMyAreas, getSessionContext } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { AppHeader } from "@/components/layout/AppHeader";
import { PortalFooter, DEFAULT_MAILBOX } from "@/components/layout/PortalFooter";
import { ButtonLink } from "@/components/ui/Button";
import { landingPathFor } from "@/lib/areas";

export const dynamic = "force-dynamic";

/**
 * Die Startseite ist die Seite **vor** dem Login (QS-074, Konrad 08.10.2026).
 *
 * Wer angemeldet ist und `/` öffnet, sieht sie nicht: er landet sofort auf der Übersichtsseite seines
 * Portals — derselben, auf der ihn auch der Login absetzt (`landingPathFor`, Rolle → Einstieg; Admin vor
 * Fachbereich vor Teilnehmer-Portal). Vorher stand hier für Angemeldete ein Knopf „Mein Profil“ und der
 * Hinweis „Angemeldet als …“: ein Umweg über eine Seite, die nichts zu tun hat.
 *
 * Das Ziel ist nie `/`: `areasFor` führt das Teilnehmer-Portal immer mit, und ein Bereich ohne Recht
 * antwortet mit 404, nicht mit einer Weiterleitung hierher — es gibt keine Schleife.
 */
export default async function Home() {
  const ctx = await getSessionContext();
  if (ctx.user) redirect(landingPathFor(await getMyAreas()));

  const { t } = await getI18n();

  return (
    <>
      <AppHeader />
      {/* Marken-Moment: Navy-Grund, Highlight-Wort in ExtraBold Italic + Akzent. */}
      <main id="content" className="flex flex-1 flex-col bg-navy text-on-navy">
        <div className="mx-auto flex w-full max-w-text flex-1 flex-col justify-center gap-8 px-6 py-24">
          <div>
            <p className="ct-eyebrow text-on-navy-muted">{t.home.eyebrow}</p>
            <h1 className="ct-display mt-3">
              {t.home.titleLead}{" "}
              {/* Der Akzent trägt auf Navy keinen Text (#6262DC dort 3,56:1).
                  Das Highlight-Wort steht im Highlight-Pink des Brandbooks
                  (Token `highlight`, 8,0:1 auf Navy) — Entscheidung 14.09.2026. */}
              <em className="ct-highlight text-highlight">
                {t.home.titleHighlight}
              </em>
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/login">{t.home.loginCta}</ButtonLink>
          </div>
        </div>
        <div className="mx-auto w-full max-w-content px-6 pb-10">
          <PortalFooter
            onNavy
            mailbox={DEFAULT_MAILBOX}
            mailboxLabel={t.common.supportMailbox}
            imprintLabel={t.common.imprint}
            privacyLabel={t.common.privacy}
          />
        </div>
      </main>
    </>
  );
}
