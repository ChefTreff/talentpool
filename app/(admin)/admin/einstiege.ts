import { canEnterAdminSection, type AdminSectionKey } from "@/lib/admin-sections";
import type { Dictionary } from "@/lib/i18n";

/** Die Menübeschriftung aus `admin.nav` — ohne die Gruppenköpfe in `sections`. */
export type NavLabel = Exclude<keyof Dictionary["admin"]["nav"], "sections">;

export type Einstieg = { key: AdminSectionKey; href: string; nav: NavLabel };

/**
 * Kandidaten für die drei Einstiege unter dem Band der Admin-Startseite
 * (Talent-Muster, QS-037), in der Reihenfolge ihres Gewichts für den Summit.
 *
 * Jede Person sieht die ersten drei, die ihre Rolle öffnen darf — Konrad
 * Programm, Speaker und Partner, die Produktion Produktion, Regie und Technik.
 * Die Liste ist so lang, dass jede Teamrolle auf drei kommt; der Test in
 * `tests/admin-einstiege.test.ts` hält das fest. Wort und Satz je Karte
 * stehen im Wörterbuch unter `admin.words` und `admin.entries`, derselbe
 * Schlüssel wie hier.
 */
export const EINSTIEGE: readonly Einstieg[] = [
  { key: "programme", href: "/admin/programm", nav: "programme" },
  { key: "speakers", href: "/admin/speaker", nav: "speakers" },
  { key: "partner", href: "/admin/partner", nav: "partnerCare" },
  { key: "production", href: "/admin/produktion", nav: "production" },
  { key: "applications", href: "/admin/bewerbungen", nav: "applications" },
  { key: "volunteers", href: "/admin/volunteers", nav: "volunteersWork" },
  { key: "regie", href: "/admin/regie", nav: "regie" },
  { key: "tech", href: "/admin/technik", nav: "tech" },
  { key: "travel", href: "/admin/anreise", nav: "travel" },
  { key: "hospitality", href: "/admin/hospitality", nav: "hospitality" },
  { key: "graphics", href: "/admin/grafiken", nav: "graphics" },
  { key: "catering", href: "/admin/catering", nav: "catering" },
  { key: "wiki", href: "/admin/wiki", nav: "wiki" },
  { key: "videos", href: "/admin/videos", nav: "videos" },
  { key: "deadlines", href: "/admin/fristen", nav: "deadlines" },
  { key: "contacts", href: "/admin/ansprechpartner", nav: "contacts" },
  { key: "persons", href: "/admin/personen", nav: "persons" },
];

/**
 * Die ersten drei Einstiege, die diese Rollen öffnen dürfen — **nach der
 * Vorgabe**, ohne Konrads Ausnahmen aus der Datenbank.
 *
 * Diese Datei bleibt bewusst frei von Server-Abhängigkeiten, damit der Test sie
 * laden kann; die Fassung mit Ausnahmen steht in `einstiege.server.ts`.
 */
export function einstiegeFuer(roleNames: readonly string[]): Einstieg[] {
  return EINSTIEGE.filter((e) => canEnterAdminSection(e.key, roleNames)).slice(0, 3);
}
