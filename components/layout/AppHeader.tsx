import Link from "next/link";
import { getMyAreas, getSessionContext } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { signOut } from "@/lib/auth-actions";
import { LocaleSwitcher } from "./LocaleSwitcher";
import type { AreaKey } from "@/lib/areas";

/**
 * Navy-Topbar mit Bereichs-Umschalter (nur Bereiche mit Rolle), DE/EN und Logout.
 * `current` hebt den aktiven Bereich hervor.
 */
export async function AppHeader({ current }: { current?: AreaKey }) {
  const ctx = await getSessionContext();
  const { locale, t } = await getI18n();
  const areas = await getMyAreas();

  return (
    <header className="bg-navy text-on-navy">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
        <Link
          href="/"
          className="font-display text-[16px] font-extrabold uppercase tracking-[0.03em] text-on-navy"
        >
          {t.nav.brand}{" "}
          <span className="font-semibold text-on-navy-muted">{t.nav.product}</span>
        </Link>

        {areas.length > 0 && (
          <nav aria-label={t.nav.myAreas} className="flex flex-wrap items-center gap-1">
            {areas.map((a) => {
              const active = a.key === current;
              return (
                <Link
                  key={a.key}
                  href={a.path}
                  aria-current={active ? "page" : undefined}
                  className={
                    "rounded-ct-sm px-2.5 py-1.5 text-[14px] font-semibold transition-colors " +
                    (active
                      ? "bg-on-navy/15 text-on-navy"
                      : "text-on-navy-muted hover:bg-on-navy/10 hover:text-on-navy")
                  }
                >
                  {t.areas[a.key].name}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-3">
          <LocaleSwitcher current={locale} label={t.common.language} />
          {ctx.user ? (
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-ct-sm px-2.5 py-1.5 text-[14px] font-semibold text-on-navy-muted transition-colors hover:bg-on-navy/10 hover:text-on-navy"
              >
                {t.nav.logout}
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="rounded-ct-sm px-2.5 py-1.5 text-[14px] font-semibold text-on-navy-muted transition-colors hover:bg-on-navy/10 hover:text-on-navy"
            >
              {t.nav.login}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
