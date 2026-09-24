/**
 * Der Fuss jeder Portalseite: Support-Postfach, Impressum, Datenschutz.
 *
 * Website-Vorbild: Footer Section (`54:9869`) — dünne Trennlinie oben, links
 * die Adresse, rechts eine Linkreihe; mobil gestapelt.
 *
 * Zwei Dinge fehlen gegenüber der Website: die Sozial-Icons und der
 * Copyright-Slogan. Ein Portal wirbt nicht, und wer hier ist, ist schon da.
 * Geblieben ist, was man im Betrieb wirklich sucht: an wen man sich wendet
 * und wo die Rechtstexte stehen.
 *
 * Das Postfach ist eine **Rollenadresse**, nie eine private (Arbeitsauftrag C,
 * Datenschutz).
 *
 * Impressum und Datenschutz zeigen auf die Hauptwebsite (Konrad, 17.09.2026,
 * `QS-018`): eigene Seiten im Portal gibt es nicht, und die Pflichtangaben
 * sind dort ohnehin gepflegt. Beide öffnen in einem neuen Tab und tragen
 * `rel="noreferrer noopener"` — sie führen aus der Anwendung heraus, und
 * wer gerade ein Formular ausfüllt, soll es nicht verlieren.
 *
 * Die Adressen stehen als Vorgabe hier und nicht in jeder Seite: ändern sie
 * sich, ändert sich eine Stelle. Wer eigene braucht, überschreibt sie.
 *
 * **Seit dem Rollout zieht `SidebarShell` den Fuß selbst** — vorher musste
 * jede Seite ihn setzen, und genau zwei von 94 taten das. Pflichtangaben, die
 * an der Disziplin einzelner Seiten hängen, fehlen irgendwann. Deshalb reicht
 * die Shell nur den Bereich herein und `mailboxFor` sucht die Rollenadresse.
 */

/**
 * Welches Rollen-Postfach zu welchem Bereich gehört.
 *
 * Die Adressen lagen als Konstante in vier Seiten verstreut (`partner/`,
 * `speaker/`, zweimal als Zeichenkette). Wer eine ändert, findet die anderen
 * nicht. Bereiche ohne eigenes Postfach landen bewusst bei `portal@` — eine
 * erfundene Adresse wäre schlimmer als eine allgemeine, die gelesen wird.
 */
const MAILBOXES: Record<string, string> = {
  partner: "partner@chef-treff.de",
  speaker: "speaker@chef-treff.de",
  "speaker-leads": "speaker@chef-treff.de",
};

import { neuesFenster } from "@/components/ui/neues-fenster";

export const DEFAULT_MAILBOX = "portal@chef-treff.de";

export function mailboxFor(area: string): string {
  return MAILBOXES[area] ?? DEFAULT_MAILBOX;
}
export const IMPRINT_URL = "https://chef-treff.de/impressum/";
export const PRIVACY_URL = "https://chef-treff.de/datenschutzerklaerung/";

export function PortalFooter({
  mailbox,
  mailboxLabel,
  imprintLabel,
  privacyLabel,
  onNavy = false,
}: {
  /** Rollen-Postfach des Bereichs, z. B. `partner@chef-treff.de`. */
  mailbox: string;
  /** „Fragen? Schreibt uns." */
  mailboxLabel: string;
  imprintLabel: string;
  privacyLabel: string;
  /**
   * Fassung für die Marken-Momente auf Navy (Login, Startseite). Dieselben
   * Angaben, andere Farben — gemessen 7,4:1 für den Hilfstext und 15,8:1 für
   * die Links. Ohne diese Fassung hätte ausgerechnet die **einzige Seite ohne
   * Anmeldung** keine Pflichtangaben getragen.
   */
  onNavy?: boolean;
}) {
  const links = [
    { href: IMPRINT_URL, label: imprintLabel },
    { href: PRIVACY_URL, label: privacyLabel },
  ];
  return (
    <footer
      className={
        onNavy
          ? "mt-12 border-t border-on-navy/20 pt-6"
          : "mt-12 border-t pt-6"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className={onNavy ? "ct-help text-on-navy-muted" : "ct-help"}>
          {mailboxLabel}{" "}
          <a
            className={onNavy ? "text-on-navy underline underline-offset-2" : "ct-link"}
            href={`mailto:${mailbox}`}
          >
            {mailbox}
          </a>
        </p>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              {...neuesFenster}
              className={
                onNavy
                  ? "ct-help text-on-navy-muted hover:text-on-navy"
                  : "ct-help hover:text-ink"
              }
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
