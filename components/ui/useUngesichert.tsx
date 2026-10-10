"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "./Modal";
import { scrolltNachRueckfrage, zielBeiKlick } from "@/components/ui/ungesichert";

/** Die Texte der Rückfrage, aus `common.unsaved` der Seite (DE oder EN). */
export type UngesichertTexte = { title: string; body: string; leave: string; stay: string };

/**
 * Warnung vor dem Verlassen mit ungesicherten Änderungen (QS-051, Web
 * Interface Guidelines „Forms“). Vorher warnte keine Seite: wer im Profil
 * tippte und dann wegklickte, verlor die Eingabe ohne Hinweis.
 *
 *   const warnung = useUngesichert(geaendert, t.common.unsaved);
 *   return <form>…{warnung}</form>;
 *
 * Solange `dirty` gilt:
 * - **Neuladen, Tab schliessen, fremde Seite:** `beforeunload` — der Browser
 *   fragt mit seinem eigenen Dialog (Text bestimmt er selbst).
 * - **Ein Link im Portal:** der Klick wird abgefangen, bevor `next/link`
 *   navigiert (Erfassung auf `document`), und die Seite fragt mit dem Kit-
 *   `ConfirmDialog`; „Seite verlassen“ navigiert dann mit dem Router.
 *   Strg-/Cmd-Klick, neue Fenster und Downloads bleiben unberührt — dabei geht
 *   nichts verloren. **Ein Wechsel auf derselben Seite** (nur die Abfrage ändert
 *   sich: Umschalter, Reiter) lässt die Seite stehen, wo sie ist
 *   (`scrolltNachRueckfrage`) — der Router kennt `scroll={false}` des Links nicht.
 *
 * Nicht abgefangen: der Zurück-Knopf des Browsers. Der App Router bietet dafür
 * keine Sperre, und ein Nachbau über `popstate` bricht seine Vor-/Zurück-Logik.
 *
 * Gibt die Rückfrage zurück; die Seite rendert sie irgendwo (sie öffnet sich
 * als `<dialog>` über allem).
 */
export function useUngesichert(dirty: boolean, texte: UngesichertTexte): ReactNode {
  const router = useRouter();
  const [ziel, setZiel] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;

    const vorDemEntladen = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Ältere Browser zeigen den Dialog nur mit gesetztem `returnValue`.
      e.returnValue = "";
    };

    const beimKlick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!a) return;
      const ziel = zielBeiKlick(
        { href: a.href, target: a.target, download: a.hasAttribute("download") },
        window.location,
        { button: e.button, meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey },
      );
      if (!ziel) return;
      e.preventDefault();
      e.stopPropagation();
      setZiel(ziel);
    };

    window.addEventListener("beforeunload", vorDemEntladen);
    document.addEventListener("click", beimKlick, true);
    return () => {
      window.removeEventListener("beforeunload", vorDemEntladen);
      document.removeEventListener("click", beimKlick, true);
    };
  }, [dirty]);

  if (!ziel) return null;
  return (
    <ConfirmDialog
      title={texte.title}
      body={texte.body}
      confirmLabel={texte.leave}
      cancelLabel={texte.stay}
      onCancel={() => setZiel(null)}
      onConfirm={() => {
        setZiel(null);
        router.push(ziel, { scroll: scrolltNachRueckfrage(ziel, window.location) });
      }}
    />
  );
}
