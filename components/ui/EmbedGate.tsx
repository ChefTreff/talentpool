"use client";

import { useState } from "react";
import { Button } from "./Button";
import { cn } from "./cn";
import { neuesFenster } from "./neues-fenster";

/**
 * Fremde Einbettung erst auf Klick — Zwei-Klick-Lösung.
 *
 * Ein `<iframe>` im Markup lädt beim Öffnen der Seite: der Anbieter erfährt
 * die IP jedes Besuchers und setzt seine Cookies, bevor irgendjemand das
 * Video sehen wollte. Hier entsteht der Rahmen **erst nach dem Klick**.
 *
 * Der Hinweis darüber ist keine Formalie, sondern die Bedingung dafür, dass
 * der Klick eine Entscheidung ist: er sagt, an wen die Daten gehen.
 */
export function EmbedGate({
  src,
  title,
  provider,
  loadLabel,
  notice,
  openLabel,
  className,
}: {
  /** Einbettungsadresse des Anbieters. */
  src: string;
  title: string;
  /** Name des Anbieters für den Hinweis, z. B. „Loom". */
  provider: string;
  loadLabel: string;
  /** „Beim Laden werden Daten an {provider} übertragen." */
  notice: string;
  /** Beschriftung für den Weg ohne Einbettung. */
  openLabel: string;
  className?: string;
}) {
  const [geladen, setGeladen] = useState(false);

  if (geladen) {
    return (
      <div className={cn("overflow-hidden rounded-ct-md border bg-navy", className)}>
        <iframe
          src={src}
          title={title}
          allowFullScreen
          // Kein `allow-same-origin`: das Video braucht es nicht, und ohne
          // bleibt der Rahmen von unserem Ursprung getrennt.
          sandbox="allow-scripts allow-presentation"
          referrerPolicy="no-referrer"
          className="aspect-video w-full border-0"
        />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-start gap-3 rounded-ct-md border bg-surface-hover p-6", className)}>
      <p className="ct-label text-ink">{title}</p>
      <p className="ct-help">{notice.replace("{provider}", provider)}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => setGeladen(true)}>
          {loadLabel}
        </Button>
        <a className="ct-link ct-small" href={src} {...neuesFenster}>
          {openLabel}
        </a>
      </div>
    </div>
  );
}
