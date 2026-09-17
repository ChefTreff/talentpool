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
 */
export const IMPRINT_URL = "https://chef-treff.de/impressum/";
export const PRIVACY_URL = "https://chef-treff.de/datenschutzerklaerung/";

export function PortalFooter({
  mailbox,
  mailboxLabel,
  imprintLabel,
  privacyLabel,
}: {
  /** Rollen-Postfach des Bereichs, z. B. `partner@chef-treff.de`. */
  mailbox: string;
  /** „Fragen? Schreibt uns." */
  mailboxLabel: string;
  imprintLabel: string;
  privacyLabel: string;
}) {
  const links = [
    { href: IMPRINT_URL, label: imprintLabel },
    { href: PRIVACY_URL, label: privacyLabel },
  ];
  return (
    <footer className="mt-12 border-t pt-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="ct-help">
          {mailboxLabel}{" "}
          <a className="ct-link" href={`mailto:${mailbox}`}>
            {mailbox}
          </a>
        </p>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noreferrer noopener"
              className="ct-help hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
