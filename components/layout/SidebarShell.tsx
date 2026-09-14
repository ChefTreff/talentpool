import Link from "next/link";
import type { ReactNode } from "react";
import { AccountMenu } from "./AccountMenu";
import { Logo } from "./Logo";
import { PortalSwitcher } from "./PortalSwitcher";
import { SidebarNav, type SidebarGroup } from "./SidebarNav";
import { getMyAreas, getSessionContext } from "@/lib/auth";
import { getI18n, type Locale } from "@/lib/i18n";
import type { AreaKey } from "@/lib/areas";

export type { SidebarGroup, SidebarItem } from "./SidebarNav";

/**
 * Das Gerüst jedes Portals (Feedback-Runde 2, F8.1–F8.6).
 *
 * Die Seitenleiste ist jetzt eine **echte** Seitenleiste: bündig am linken
 * Rand, über die volle Höhe, kein Container darum. Vorher war sie eine
 * abgerundete Karte innerhalb eines zentrierten Inhaltsbereichs — das sah aus
 * wie ein Widget und nicht wie die Navigation einer Anwendung.
 *
 * Oben steht dauerhaft das Logo, darunter die **Auswahl des Portals** (F8.3)
 * statt einer Linkreihe in der Kopfzeile. Der Admin-Bereich steht dort nicht
 * als Portal neben den anderen, sondern darunter als eigener Weg (F8.6): er
 * ist die Verwaltung hinter den Portalen, kein Portal.
 *
 * Rechts oben sitzt das **globale Profilmenü** (F8.5). „Mein Profil" hängt
 * deshalb nicht mehr in der Bereichsnavigation — es führte aus dem
 * Volunteer-Portal ins Speaker-Portal, was niemand erwartet.
 *
 * Unter 1024 px steht die Leiste als Block über dem Inhalt; sie ist eine
 * Liste, keine Ausklapp-Mechanik.
 */
export async function SidebarShell({
  area,
  label,
  groups,
  rootHref,
  locale,
  header,
  footer,
  children,
}: {
  area: AreaKey;
  /** Zugänglicher Name der Bereichsnavigation. */
  label: string;
  groups: SidebarGroup[];
  rootHref: string;
  /** Sprache, wenn die Person keine gewählt hat — wie in `getI18n`. */
  locale?: Locale;
  /** Optional über der Navigation, z. B. der Org-Wechsler. */
  header?: ReactNode;
  /** Optional darunter, z. B. das Rollen-Postfach für Rückfragen. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { locale: aktiv, t } = await getI18n(locale);
  const [ctx, areas] = await Promise.all([getSessionContext(), getMyAreas()]);

  // Zwei Bereiche stehen nicht in der Portalauswahl:
  //   * **Admin** ist kein Portal neben den anderen, sondern die Verwaltung
  //     dahinter — sein Weg sitzt unten in der Leiste (F8.6).
  //   * **Einlass** ist eine Geräte-App. Das Kiosk-Konto landet direkt dort,
  //     und das Team erreicht den Einlass über den Admin-Bereich; als Eintrag
  //     zwischen den Portalen stünde er nur im Weg.
  // Beides ist Darstellung — an den Rechten ändert sich nichts, darüber
  // entscheidet weiterhin `is_staff()` in SQL.
  const portale = areas
    .filter((a) => a.key !== "admin" && a.key !== "checkin")
    .map((a) => ({ key: a.key, path: a.path, name: t.areas[a.key].name }));
  const admin = areas.find((a) => a.key === "admin");

  const name = ctx.firstName?.trim() || ctx.user?.email?.split("@")[0] || t.nav.account;

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="bg-navy text-on-navy lg:sticky lg:top-0 lg:h-dvh lg:w-[264px] lg:shrink-0 lg:overflow-y-auto">
        <div className="flex h-full flex-col gap-5 px-4 py-5">
          <Link href={rootHref} className="block rounded-ct-sm px-2 py-1 text-on-navy">
            <Logo />
          </Link>

          <PortalSwitcher areas={portale} current={area} label={t.nav.myAreas} />

          {header}
          <div className="flex-1">
            <SidebarNav label={label} groups={groups} rootHref={rootHref} />
          </div>
          {footer && <div className="border-t border-on-navy/15 pt-4">{footer}</div>}

          {/* Der Admin-Bereich: sichtbar und abgesetzt, nicht in der
              Portalauswahl (F8.6). Er ist kein Portal neben den anderen,
              sondern die Verwaltung dahinter — deshalb unten, mit Abstand
              und eigener Form. */}
          {admin && (
            <Link
              href={`${admin.path}?von=${area}`}
              className="flex min-h-11 items-center gap-2 rounded-ct-sm border border-on-navy/25 px-3 py-2 ct-label text-on-navy-muted transition-colors hover:bg-on-navy/10 hover:text-on-navy"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 1.8 13.2 4v4c0 3-2.2 5.2-5.2 6.2C5 13.2 2.8 11 2.8 8V4z" />
              </svg>
              {t.areas.admin.portal}
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-2 border-b bg-surface px-4 py-2 sm:px-6">
          <AccountMenu
            name={name}
            email={ctx.user?.email ?? null}
            photoUrl={null}
            label={t.nav.account}
            profileLabel={t.profile.title}
            profileHref="/profil"
            locale={aktiv}
            languageLabel={t.common.language}
            logoutLabel={t.nav.logout}
          />
        </header>

        <main id="content" className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
