import Link from "next/link";
import { getSessionContext } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { signOut } from "@/lib/auth-actions";
import { Logo } from "./Logo";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { AREAS, type AreaKey } from "@/lib/areas";

/**
 * Navy-Kopfzeile für die Seiten **ohne** Portal-Gerüst: Startseite und Login.
 *
 * In den Portalen übernimmt `SidebarShell` — dort steht die Marke in der
 * Seitenleiste, die Portalauswahl im Menü darunter und das Konto oben rechts
 * (Feedback-Runde 2, F8.1–F8.5). Die Bereichsliste, die hier früher stand,
 * gibt es deshalb nicht mehr: es gäbe sie sonst zweimal an zwei Orten.
 */
export async function AppHeader({ current }: { current?: AreaKey }) {
  const ctx = await getSessionContext();
  const { locale, t } = await getI18n();

  const area = current ? AREAS.find((a) => a.key === current) : undefined;
  const wordmark = area ? t.areas[area.key].portal : t.nav.product;

  return (
    <header className="bg-navy text-on-navy">
      {/* Dieselbe Maximalbreite wie der Inhalt jeder Portalseite. Vorher stand
          hier 1400 und in der Shell 1200 — zwei Breiten für dieselbe App, und
          auf breiten Schirmen saß die Wortmarke sichtbar weiter außen als
          alles darunter. */}
      <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
        <Link href={area?.path ?? "/"} className="flex items-center gap-2 text-on-navy">
          <Logo />
          <span className="ct-wordmark text-on-navy-muted">{wordmark}</span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <LocaleSwitcher current={locale} label={t.common.language} />
          {ctx.user ? (
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-ct-sm px-2.5 py-1.5 ct-label text-on-navy-muted transition-colors hover:bg-on-navy/10 hover:text-on-navy"
              >
                {t.nav.logout}
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="rounded-ct-sm px-2.5 py-1.5 ct-label text-on-navy-muted transition-colors hover:bg-on-navy/10 hover:text-on-navy"
            >
              {t.nav.login}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
