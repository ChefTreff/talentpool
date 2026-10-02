"use client";

import { useState, type HTMLAttributeReferrerPolicy } from "react";
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
 *
 * Die Vorgaben sind die enge Fassung für Loom-Videos. Ein Anbieter, der mehr
 * braucht (der Matterport-Rundgang: Speicher, Vollbild, Herkunftsangabe),
 * setzt die optionalen Eigenschaften — jede Lockerung steht dann dort, wo der
 * Anbieter eingebunden wird, mit ihrem Grund, nicht hier als neue Vorgabe.
 */
export function EmbedGate({
  src,
  title,
  provider,
  loadLabel,
  notice,
  openLabel,
  className,
  sandbox = "allow-scripts allow-presentation",
  allow,
  ratio = "aspect-video",
  referrer = "no-referrer",
  loadingLabel,
  afterLoadHint,
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
  /**
   * Sandbox des Rahmens. Vorgabe: ohne `allow-same-origin`, damit der Rahmen
   * von unserem Ursprung getrennt bleibt; das Video braucht es nicht.
   */
  sandbox?: string;
  /** Berechtigungen für den Rahmen (`allow`), z. B. „fullscreen; xr-spatial-tracking“. */
  allow?: string;
  /** Seitenverhältnis als Tailwind-Klasse; Vorgabe 16:9. */
  ratio?: string;
  /**
   * Was der Anbieter als Herkunft erfährt. Vorgabe: nichts. Nur setzen, wenn
   * der Anbieter die Herkunft braucht (Matterport schränkt die erlaubten
   * Seiten über die Herkunft ein).
   */
  referrer?: HTMLAttributeReferrerPolicy;
  /** Text, solange der Rahmen lädt. Ohne ihn zeigt die Einbettung keinen Ladezustand. */
  loadingLabel?: string;
  /**
   * Hinweis samt Weg ohne Einbettung **unter** dem geladenen Rahmen — für
   * Einbettungen, die langsam starten oder blockiert sein können. Ohne ihn
   * steht dort nichts.
   */
  afterLoadHint?: string;
}) {
  const [geladen, setGeladen] = useState(false);
  const [bereit, setBereit] = useState(false);

  if (geladen) {
    return (
      <div className={className}>
        <div className="relative overflow-hidden rounded-ct-md border bg-navy">
          {/* Der Ladetext liegt **hinter** dem Rahmen. Das `load`-Ereignis meldet nur, dass das Dokument des
              Anbieters da ist; sein Player braucht danach noch Sekunden, bis er etwas zeichnet (Matterport:
              etwa 15). Solange der Rahmen durchsichtig ist, steht der Text da, und sobald der Player zeichnet,
              deckt er ihn zu. Für Vorlesegeräte nur bis zum `load`: danach wäre „Lädt …“ eine falsche Auskunft. */}
          {loadingLabel && (
            <div
              role="status"
              aria-hidden={bereit || undefined}
              className="ct-small absolute inset-0 flex items-center justify-center text-on-navy"
            >
              {loadingLabel}
            </div>
          )}
          <iframe
            src={src}
            title={title}
            allowFullScreen
            allow={allow}
            sandbox={sandbox}
            referrerPolicy={referrer}
            onLoad={() => setBereit(true)}
            className={cn("relative", ratio, "w-full border-0")}
          />
        </div>
        {afterLoadHint && (
          <p className="ct-help mt-2">
            {afterLoadHint}{" "}
            <a className="ct-link" href={src} {...neuesFenster}>
              {openLabel}
            </a>
          </p>
        )}
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
