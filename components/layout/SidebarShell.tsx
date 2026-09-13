import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { SidebarNav, type SidebarGroup } from "./SidebarNav";
import { getI18n, type Locale } from "@/lib/i18n";
import type { AreaKey } from "@/lib/areas";

export type { SidebarGroup, SidebarItem } from "./SidebarNav";

/**
 * Bereichsgerüst mit Navy-Seitenleiste (Design-Briefing §4: Partner, Speaker,
 * Volunteers). Darüber bleibt die bekannte Topbar mit dem Bereichs-Umschalter.
 *
 * Die Leiste ist eine schlichte Liste, keine Ausklapp-Mechanik: unter 1024 px
 * steht sie als Block über dem Inhalt. Ohne Punkte fällt sie ganz weg — etwa
 * solange keine Organisation gewählt ist.
 */
export async function SidebarShell({
  area,
  label,
  groups,
  rootHref,
  locale,
  accountLink = true,
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
  /** „Mein Konto" anhängen. Aus, wo das Profil schon in den Punkten steht. */
  accountLink?: boolean;
  /** Optional über der Navigation, z. B. der Org-Wechsler. */
  header?: ReactNode;
  /** Optional darunter, z. B. das Rollen-Postfach für Rückfragen. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = await getI18n(locale);
  // Jeder Fachbereich trägt den Weg zum eigenen Konto — sonst käme eine
  // Speakerin nicht mehr an ihr Profil, seit das Teilnehmer-Portal nicht
  // mehr im Umschalter steht (Konrads Entscheidung 13.09.). Im
  // Teilnehmer-Portal selbst wäre der Punkt doppelt.
  const withAccount: SidebarGroup[] =
    area === "talent" || !accountLink
      ? groups
      : [...groups, { label: t.nav.account, items: [{ href: "/profil", label: t.profile.title }] }];
  const hasNav = withAccount.some((g) => g.items.length > 0);

  return (
    <>
      <AppHeader current={area} />
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 px-6 py-8 lg:flex-row lg:gap-8">
        {hasNav && (
          <div className="shrink-0 rounded-ct-lg bg-navy p-4 text-on-navy lg:w-[260px]">
            {header && <div className="mb-4">{header}</div>}
            <SidebarNav label={label} groups={withAccount} rootHref={rootHref} />
            {footer && <div className="mt-5 border-t border-on-navy/15 pt-4">{footer}</div>}
          </div>
        )}
        <main id="content" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </>
  );
}
