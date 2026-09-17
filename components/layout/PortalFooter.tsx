import Link from "next/link";

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
 * Impressum und Datenschutz erscheinen nur, wenn ihr Pfad übergeben wird.
 * Die Seiten gibt es im Repo noch nicht (Stand 17.09.2026, Backlog
 * `QS-018`); ein Link, der auf 404 führt, ist schlechter als kein Link —
 * gerade bei Pflichtangaben.
 */
export function PortalFooter({
  mailbox,
  mailboxLabel,
  imprint,
  privacy,
}: {
  /** Rollen-Postfach des Bereichs, z. B. `partner@chef-treff.de`. */
  mailbox: string;
  /** „Fragen? Schreibt uns." */
  mailboxLabel: string;
  imprint?: { href: string; label: string };
  privacy?: { href: string; label: string };
}) {
  const links = [imprint, privacy].filter(Boolean) as { href: string; label: string }[];
  return (
    <footer className="mt-12 border-t pt-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="ct-help">
          {mailboxLabel}{" "}
          <a className="ct-link" href={`mailto:${mailbox}`}>
            {mailbox}
          </a>
        </p>
        {links.length > 0 && (
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="ct-help hover:text-ink">
                {l.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </footer>
  );
}
