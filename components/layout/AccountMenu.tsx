"use client";

import { useTransition } from "react";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { cn } from "@/components/ui/cn";
import { signOut } from "@/lib/auth-actions";
import { LocaleSwitcher } from "./LocaleSwitcher";
import type { Locale } from "@/lib/i18n/shared";

/**
 * Das Profilmenü oben rechts — **global, unabhängig vom Portal** (F8.5).
 *
 * Vorher hing „Mein Profil" als Navigationspunkt in jedem Fachbereich und
 * führte ins Teilnehmer-Portal: wer im Volunteer-Portal aufs Profil klickte,
 * landete im Speaker-Portal. Das Profil gehört keinem Bereich, es gehört der
 * Person — also an die Stelle, an der man es aus jedem Werkzeug kennt.
 *
 * Kein Foto in der Sitzung: `session_context()` liefert heute nur den
 * Vornamen. Bis Nachname und Bild dort stehen, trägt der Kreis die Initiale.
 */
export function AccountMenu({
  name,
  email,
  photoUrl,
  label,
  profileLabel,
  profileHref,
  locale,
  languageLabel,
  logoutLabel,
}: {
  name: string;
  email: string | null;
  photoUrl: string | null;
  label: string;
  profileLabel: string;
  profileHref: string;
  locale: Locale;
  /** „Sprache" — der Eintrag zeigt daneben, wohin er wechselt. */
  languageLabel: string;
  logoutLabel: string;
}) {
  const [, start] = useTransition();
  const initiale = (name.trim()[0] ?? email?.trim()[0] ?? "?").toUpperCase();

  return (
    <Menu
      label={label}
      align="end"
      width="w-64"
      trigger={
        <>
          <Avatar initiale={initiale} photoUrl={photoUrl} />
          <span className="ct-label hidden truncate text-ink sm:inline">{name}</span>
        </>
      }
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Avatar initiale={initiale} photoUrl={photoUrl} groß />
        <span className="min-w-0">
          <span className="block truncate ct-label text-ink">{name}</span>
          {email && <span className="block truncate ct-help">{email}</span>}
        </span>
      </div>
      <MenuSeparator />
      <MenuItem href={profileHref}>{profileLabel}</MenuItem>
      {/* Der Umschalter statt einer Zeile „Sprache: EN" (QS-024). Die zeigte
          die **andere** Sprache — niemand wusste, ob EN gerade an ist oder ob
          man damit dorthin wechselt. Kein `MenuItem`: das Menü schliesst beim
          Klick auf einen Eintrag, und wer die Sprache umstellt, will das
          Ergebnis sehen, ohne das Menü neu zu öffnen. */}
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <span className="ct-label text-muted">{languageLabel}</span>
        <LocaleSwitcher current={locale} label={languageLabel} tone="light" />
      </div>
      <MenuSeparator />
      <MenuItem onSelect={() => start(async () => void (await signOut()))}>{logoutLabel}</MenuItem>
    </Menu>
  );
}

function Avatar({ initiale, photoUrl, groß }: { initiale: string; photoUrl: string | null; groß?: boolean }) {
  const größe = groß ? "h-10 w-10" : "h-8 w-8";
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- Profilbilder liegen in Supabase Storage, keine feste Größe.
    return <img src={photoUrl} alt="" className={cn(größe, "shrink-0 rounded-full object-cover")} />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        größe,
        "flex shrink-0 items-center justify-center rounded-full bg-accent-soft ct-label text-accent-deep",
      )}
    >
      {initiale}
    </span>
  );
}
