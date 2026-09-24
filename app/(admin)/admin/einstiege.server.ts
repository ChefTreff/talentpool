import "server-only";
import { mayEnterAdminSection } from "@/lib/admin-access";
import { EINSTIEGE, type Einstieg } from "./einstiege";

/**
 * Die drei Einstiege der Startseite **mit** Konrads Ausnahmen (ADM-053) —
 * dieselbe Prüfung wie Seitenleiste und Seiten-Gate. Eine Karte zu einem
 * Abschnitt, der danach mit 404 antwortet, wäre schlimmer als keine.
 *
 * Getrennt von `einstiege.ts`, weil die Ausnahmen aus der Datenbank kommen und
 * `server-only` sonst den Test der Kandidatenliste mitnähme.
 */
export async function einstiegeMitAusnahmen(roleNames: readonly string[]): Promise<Einstieg[]> {
  const erlaubt = await Promise.all(EINSTIEGE.map((e) => mayEnterAdminSection(e.key, roleNames)));
  return EINSTIEGE.filter((_, i) => erlaubt[i]).slice(0, 3);
}
