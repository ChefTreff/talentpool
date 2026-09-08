import { getSessionContext } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { AppHeader } from "@/components/layout/AppHeader";
import { ButtonLink } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

export default async function Home() {
  const ctx = await getSessionContext();
  const { t } = await getI18n();

  return (
    <>
      <AppHeader />
      {/* Marken-Moment: Navy-Grund, Highlight-Wort in ExtraBold Italic + Akzent. */}
      <main id="content" className="flex flex-1 flex-col bg-navy text-on-navy">
        <div className="mx-auto flex w-full max-w-[800px] flex-1 flex-col justify-center gap-8 px-6 py-24">
          <div>
            <p className="ct-eyebrow text-on-navy-muted">{t.home.eyebrow}</p>
            <h1 className="ct-h1 mt-3 text-[40px] leading-[44px] md:text-[52px] md:leading-[56px]">
              {t.home.titleLead}{" "}
              <em className="ct-highlight text-accent">
                {t.home.titleHighlight}
              </em>
            </h1>
            <p className="ct-laica mt-5 max-w-[46ch] text-on-navy-muted">
              {t.home.lead}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {ctx.user ? (
              <ButtonLink href="/profil">{t.home.profileCta}</ButtonLink>
            ) : (
              <ButtonLink href="/login">{t.home.loginCta}</ButtonLink>
            )}
            {ctx.user && (
              <span className="self-center text-[14px] text-on-navy-muted">
                {t.home.loggedInAs} {ctx.user.email}
              </span>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
