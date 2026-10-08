import { redirect } from "next/navigation";
import { getMyAreas, getSessionContext } from "@/lib/auth";
import { landingPathFor } from "@/lib/areas";

export const dynamic = "force-dynamic";

/**
 * Die Wurzeladresse zeigt nichts, sie leitet weiter (QS-074, Konrad 08.10.2026): die Startseite „Ein Login
 * für alles“ war für Angemeldete ein Umweg und für alle anderen eine zweite Seite vor dem Login.
 *
 * - **Angemeldet:** sofort auf die Übersichtsseite des eigenen Portals — derselben, auf der ihn auch der Login
 *   absetzt (`landingPathFor`: Rolle → Einstieg; Admin vor Fachbereich vor Teilnehmer-Portal).
 * - **Nicht angemeldet:** auf die Login-Seite. Sie trägt jetzt den Text „Welcome to the Future Leader Club“.
 *
 * Das Ziel ist nie `/`: `areasFor` führt das Teilnehmer-Portal immer mit, und ein Bereich ohne Recht antwortet
 * mit 404, nicht mit einer Weiterleitung hierher — es gibt keine Schleife.
 */
export default async function Home() {
  const ctx = await getSessionContext();
  redirect(ctx.user ? landingPathFor(await getMyAreas()) : "/login");
}
