"use client";

import { useSyncExternalStore } from "react";
import type { ErrorInfo } from "next/error";
import { sharpSans, sharpSansItalic, laica } from "@/lib/fonts";
import { Fehlergrenze } from "@/components/fehler/Fehlergrenze";
import { FEHLER_RESERVE, spracheImBrowser } from "@/components/fehler/fehler";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/shared";
import { DEFAULT_MAILBOX } from "@/components/layout/PortalFooter";
import "./globals.css";

/** Die Sprache ändert sich nicht, solange die Seite steht. */
const nieAendern = () => () => {};

/**
 * Das letzte Netz (QS-023): Hier landet, was im Wurzel-Layout selbst ausfällt.
 * Diese Datei **ersetzt** das Layout — eigenes `<html>`, eigene Schriften,
 * eigenes CSS — und hat weder Wörterbuch noch Kontext vom Server. Die Texte
 * kommen deshalb aus der Reserve in `components/fehler/fehler.ts`, die Sprache
 * aus dem Cookie des Umschalters oder dem Browser; beim Rendern auf dem Server
 * gilt Deutsch, bis der Browser übernimmt.
 */
export default function GlobalError({ error, retry }: ErrorInfo) {
  const locale = useSyncExternalStore<Locale>(
    nieAendern,
    () => spracheImBrowser(document.cookie, navigator.languages ?? [navigator.language]),
    () => DEFAULT_LOCALE,
  );

  return (
    <html
      lang={locale}
      className={`${sharpSans.variable} ${sharpSansItalic.variable} ${laica.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <title>{FEHLER_RESERVE[locale].boundaryTitle}</title>
        <Fehlergrenze
          error={error}
          retry={retry}
          startHref="/"
          rahmen="seite"
          texte={FEHLER_RESERVE[locale]}
          mailbox={DEFAULT_MAILBOX}
        />
      </body>
    </html>
  );
}
