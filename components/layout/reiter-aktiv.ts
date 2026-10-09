/**
 * Ist ein Reiter der `SectionTabs` gerade der aktive? Als reine Funktion, damit die Fälle in `tests/reiter-aktiv.test.ts` festgehalten sind — die
 * Komponente liest nur `usePathname()` und ruft sie auf.
 *
 * - **`aktiv`** (die Seite weiß es, etwa bei Reitern über die Adresszeile, QS-059) gilt vor allem anderen.
 * - **Eine Abfrage im Ziel gehört nicht zum Pfad** (`/partner/masterclass?instanz=…`, QS-079): verglichen wird der Pfad davor.
 * - **Eine Adresse nur mit Abfrage** (`?instanz=…`) hat keinen Pfad. `pathname.startsWith("/")` wäre dann immer wahr und jeder solche Reiter
 *   immer aktiv (Design 09.10.2026) — er ist es nur über `aktiv`.
 * - `exact`: nur der Pfad selbst (oder das `detailPattern`, damit eine Detailseite den Reiter ihrer Liste markiert); sonst der Pfad und alles darunter.
 */
export type ReiterAngaben = {
  href: string;
  exact?: boolean;
  /** Zusätzliches Muster als Zeichenkette (ein `RegExp` überquert die Server-Client-Grenze nicht). */
  detailPattern?: string;
  aktiv?: boolean;
};

export function reiterAktiv(item: ReiterAngaben, pathname: string): boolean {
  if (item.aktiv !== undefined) return item.aktiv;
  const pfad = item.href.split("?")[0];
  if (pfad === "") return false;
  if (item.exact) return pathname === pfad || (item.detailPattern ? new RegExp(item.detailPattern).test(pathname) : false);
  return pathname === pfad || pathname.startsWith(`${pfad}/`);
}
