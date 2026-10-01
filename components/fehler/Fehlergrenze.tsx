"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { DEFAULT_MAILBOX } from "@/components/layout/PortalFooter";
import { FEHLER_RESERVE, fehlerId, type FehlerTexte } from "@/components/fehler/fehler";

type FehlerKontext = { texte: FehlerTexte; mailbox: string };

const Kontext = createContext<FehlerKontext | null>(null);

/**
 * Gibt den Fehlergrenzen darunter Texte und Postfach mit (QS-023).
 *
 * Eine `error.tsx` bekommt von Next nur den Fehler und `retry` — keine Props
 * vom Server und kein Wörterbuch. Sie liegt aber **unter** dem Layout ihres
 * Bereichs; was das Layout um seine Kinder legt, erreicht sie. Deshalb setzen
 * das Wurzel-Layout und `SidebarShell` diesen Kontext, beide in der Sprache,
 * die sie ohnehin schon aufgelöst haben.
 */
export function FehlerKontextGeber({
  texte,
  mailbox,
  children,
}: FehlerKontext & { children: ReactNode }) {
  return <Kontext.Provider value={{ texte, mailbox }}>{children}</Kontext.Provider>;
}

/**
 * Die eine Fehlergrenze aller Bereiche: was passiert ist, die Fehler-ID, „Neu
 * laden" und der Weg zur Startseite des Bereichs.
 *
 * **Vom Fehler selbst zeigt sie nur `fehlerId(error)`** — nie die Meldung,
 * nie den Stacktrace (`components/fehler/fehler.ts`, geprüft in
 * `tests/fehlergrenzen.test.ts`). Den vollständigen Fehler schreibt sie unter
 * der ID in die Konsole des Browsers; dort steht er ohnehin, React meldet
 * jeden abgefangenen Fehler dort.
 *
 * „Neu laden" ruft `retry`: Next lädt die Daten der Seite neu und rendert sie
 * noch einmal, ohne den Rest der Anwendung zu verlieren. Der Weg zur
 * Startseite fehlt, wenn man schon dort ist — ein Link auf die eigene Adresse
 * setzt die Grenze nicht zurück und täte nichts.
 *
 * `rahmen="seite"` steht die Meldung mittig auf einer eigenen Fläche (Wurzel,
 * `global-error`, Einlass ohne Gerüst); im Bereich steht sie dort, wo sonst
 * die Seite steht, und Leiste und Fuß bleiben.
 */
export function Fehlergrenze({
  error,
  retry,
  startHref,
  rahmen = "bereich",
  texte: eigeneTexte,
  mailbox: eigenesPostfach,
}: {
  error: unknown;
  retry: () => void;
  startHref: string;
  rahmen?: "bereich" | "seite";
  /** Nur für `global-error`: dort gibt es keinen Kontext. */
  texte?: FehlerTexte;
  mailbox?: string;
}) {
  const kontext = useContext(Kontext);
  const t = eigeneTexte ?? kontext?.texte ?? FEHLER_RESERVE.de;
  const mailbox = eigenesPostfach ?? kontext?.mailbox ?? DEFAULT_MAILBOX;
  const id = fehlerId(error);
  const pfad = usePathname();
  const flaeche = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.error(`Fehler-ID ${id}`, error);
  }, [id, error]);

  useEffect(() => {
    // Der Fokus lag auf etwas, das mit der Seite verschwunden ist. Auf der
    // Überschrift liest ein Screenreader vor, was passiert ist.
    flaeche.current?.querySelector<HTMLElement>("h1")?.focus();
  }, []);

  const [vor, nach] = t.boundaryBody.split("{mailbox}");
  const betreff = encodeURIComponent(`${t.boundaryId} ${id}`);

  const meldung = (
    <ErrorState
      title={t.boundaryTitle}
      description={
        nach === undefined ? (
          vor
        ) : (
          <>
            {vor}
            <a href={`mailto:${mailbox}?subject=${betreff}`} className="ct-link">
              {mailbox}
            </a>
            {nach}
          </>
        )
      }
      idLabel={t.boundaryId}
      id={id}
      actions={
        <>
          <Button onClick={() => retry()}>{t.boundaryRetry}</Button>
          {pfad !== startHref && (
            <ButtonLink href={startHref} variant="secondary">
              {t.boundaryHome}
            </ButtonLink>
          )}
        </>
      }
    />
  );

  if (rahmen === "seite") {
    return (
      <main id="content" className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-16">
        <div ref={flaeche} className="w-full max-w-text">
          {meldung}
        </div>
      </main>
    );
  }
  return <div ref={flaeche}>{meldung}</div>;
}
