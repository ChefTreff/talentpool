"use client";

import { Menu, MenuItem } from "@/components/ui/Menu";

export type PortalEintrag = { key: string; path: string; name: string };

/**
 * Auswahl des aktuellen Portals — **im Menü**, nicht als Linkreihe in der
 * Kopfzeile (F8.3).
 *
 * Der Auslöser zeigt, wo man gerade ist; das ist im Betrieb die häufigere
 * Frage als „wohin kann ich". Bei genau einem Portal gibt es nichts zu
 * wählen: dann steht der Name da, ohne Auslöser und ohne Pfeil.
 *
 * Der Admin-Bereich steht **nicht** in dieser Liste (F8.6) — er ist kein
 * Portal neben den anderen, sondern die Verwaltung dahinter. Sein Weg sitzt
 * unten in der Seitenleiste, sichtbar und abgesetzt.
 */
export function PortalSwitcher({
  areas,
  current,
  label,
}: {
  areas: PortalEintrag[];
  current?: string;
  /** Zugänglicher Name des Auslösers, z. B. „Portal wechseln". */
  label: string;
}) {
  const aktuell = areas.find((a) => a.key === current);
  const name = aktuell?.name ?? areas[0]?.name ?? "";
  const waehlbar = areas.length > 1;

  if (!waehlbar) {
    return (
      <p className="px-2 py-1.5 ct-label text-on-navy">{name}</p>
    );
  }

  return (
    <Menu
      label={label}
      width="w-[13rem]"
      trigger={
        <>
          <span className="ct-label min-w-0 flex-1 truncate text-on-navy">{name}</span>
          <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-on-navy-muted" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 4.5 6 7.5 9 4.5" />
          </svg>
        </>
      }
    >
      {areas.map((a) => (
        <MenuItem key={a.key} href={a.path} current={a.key === current}>
          {a.name}
        </MenuItem>
      ))}
    </Menu>
  );
}
