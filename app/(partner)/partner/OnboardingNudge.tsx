"use client";

import { useSyncExternalStore } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

const SCHLUESSEL = "ct.onboarding-hinweis.gesehen";
/** Eigenes Ereignis, damit `useSyncExternalStore` das Schliessen mitbekommt. */
const EREIGNIS = "ct:onboarding-hinweis";

/**
 * Einmaliger Hinweis aufs Onboarding — **kein** Zwang.
 *
 * Vorher war das eine Weiterleitung: wer die Übersicht öffnete, landete im
 * Formular, und zwar jedes Mal. Konrads Einwand stimmt — eine Weiterleitung
 * bei jedem Besuch ist keine Begrüssung, sondern eine Sperre, und wer schon
 * lange angemeldet ist, wird davon nur genervt.
 *
 * Jetzt: ein Dialog, der **einmal** kommt und sich merkt, dass er es war.
 * `localStorage` je Organisation und Edition — bewusst kein Serverfeld: ob
 * jemand einen Hinweis gesehen hat, ist keine Geschäftsinformation, und ein
 * neues Gerät darf ihn ruhig noch einmal zeigen.
 *
 * Gelesen wird über `useSyncExternalStore` und nicht in einem Effekt: der
 * Server-Schnappschuss sagt „schon gesehen", also rendert serverseitig nichts
 * und es gibt keinen Sprung beim Hydrieren. Ein Effekt, der nach dem
 * Einhängen `setState` ruft, täte dasselbe — aber mit einem zusätzlichen
 * Render, den React zu Recht anmahnt.
 */
export function OnboardingNudge({
  orgEditionId,
  title,
  body,
  action,
  later,
  href,
}: {
  orgEditionId: string;
  title: string;
  body: string;
  action: string;
  later: string;
  href: string;
}) {
  const key = `${SCHLUESSEL}.${orgEditionId}`;
  const gesehen = useSyncExternalStore(
    (benachrichtige) => {
      window.addEventListener(EREIGNIS, benachrichtige);
      return () => window.removeEventListener(EREIGNIS, benachrichtige);
    },
    () => {
      try {
        return window.localStorage.getItem(key) ?? "0";
      } catch {
        // Privates Fenster oder gesperrter Speicher: dann eben kein Hinweis.
        return "1";
      }
    },
    () => "1",
  );

  function schliessen() {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      /* siehe oben */
    }
    window.dispatchEvent(new Event(EREIGNIS));
  }

  if (gesehen === "1") return null;
  return (
    <Modal label={title} onCancel={schliessen}>
      <h2 className="ct-h2">{title}</h2>
      <p className="ct-help mt-2">{body}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <ButtonLink href={href} onClick={schliessen}>
          {action}
        </ButtonLink>
        <Button variant="secondary" onClick={schliessen}>
          {later}
        </Button>
      </div>
    </Modal>
  );
}
