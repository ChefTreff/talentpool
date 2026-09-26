"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { EmbedGate } from "@/components/ui/EmbedGate";
import { Modal } from "@/components/ui/Modal";

const SCHLUESSEL = "ct.shop-einstieg.gesehen";
/** Eigenes Ereignis, damit `useSyncExternalStore` das Schliessen mitbekommt. */
const EREIGNIS = "ct:shop-einstieg";

type Texte = {
  guideTitle: string;
  guideBody: string;
  guideVideo: string;
  guideWiki: string;
  introTitle: string;
  introBody: string;
  introStart: string;
  close: string;
};

/**
 * Einstieg in den Messeshop (PART-039, Konrad: „Pop-up beim ersten Besuch
 * und Hinweis ‚Anleitung & Support‘ mit Video und Wiki-Link, keine grosse
 * Startseite“).
 *
 * - **Beim ersten Besuch** öffnet sich ein Dialog mit dem Erklärvideo — aber
 *   nur, wenn es eins gibt (`portal_video`, Schlüssel `partner_shop`; den Link
 *   pflegt Konrad unter `/admin/videos`). Ohne Video kein leerer Dialog.
 * - **Unten auf jeder Shop-Seite** steht „Anleitung & Support“: das Video zum
 *   Wiederansehen und der Weg ins Wiki.
 *
 * Gemerkt wird der erste Besuch wie beim Onboarding-Hinweis in `localStorage`
 * je Organisation und Edition — kein Serverfeld: ob jemand ein Video gesehen
 * hat, ist keine Geschäftsinformation, und ein neues Gerät darf es noch
 * einmal zeigen. Serverseitig gilt „schon gesehen“, also springt beim
 * Hydrieren nichts.
 */
export function ShopEinstieg({
  schluessel,
  video,
  wikiHref,
  t,
  embed,
}: {
  /** Organisation und Edition, z. B. `${orgId}.${editionId}`. */
  schluessel: string;
  video: { src: string; title: string } | null;
  wikiHref: string;
  t: Texte;
  embed: { loadLabel: string; notice: string; openLabel: string };
}) {
  const key = `${SCHLUESSEL}.${schluessel}`;
  const gesehen = useSyncExternalStore(
    (benachrichtige) => {
      window.addEventListener(EREIGNIS, benachrichtige);
      return () => window.removeEventListener(EREIGNIS, benachrichtige);
    },
    () => {
      try {
        return window.localStorage.getItem(key) ?? "0";
      } catch {
        // Privates Fenster oder gesperrter Speicher: dann eben kein Pop-up.
        return "1";
      }
    },
    () => "1",
  );
  const [offen, setOffen] = useState(false);
  const ersterBesuch = gesehen !== "1";

  function schliessen() {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      /* siehe oben */
    }
    window.dispatchEvent(new Event(EREIGNIS));
    setOffen(false);
  }

  return (
    <>
      <aside aria-labelledby="h-shop-hilfe" className="mt-10 border-t pt-4">
        <h2 id="h-shop-hilfe" className="ct-h3 text-ink">
          {t.guideTitle}
        </h2>
        <p className="ct-help mt-1 max-w-text">{t.guideBody}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {video && (
            <Button variant="secondary" onClick={() => setOffen(true)}>
              {t.guideVideo}
            </Button>
          )}
          <Link className="ct-link ct-small" href={wikiHref}>
            {t.guideWiki}
          </Link>
        </div>
      </aside>

      {video && (ersterBesuch || offen) && (
        <Modal label={ersterBesuch ? t.introTitle : video.title} onCancel={schliessen}>
          <h2 className="ct-h2">{ersterBesuch ? t.introTitle : video.title}</h2>
          {ersterBesuch && <p className="ct-help mt-2">{t.introBody}</p>}
          <EmbedGate className="mt-4" src={video.src} title={video.title} provider="Loom" {...embed} />
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={schliessen}>{ersterBesuch ? t.introStart : t.close}</Button>
            <Link className="ct-link ct-small" href={wikiHref} onClick={schliessen}>
              {t.guideWiki}
            </Link>
          </div>
        </Modal>
      )}
    </>
  );
}
