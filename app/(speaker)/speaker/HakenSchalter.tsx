"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckMark } from "@/components/ui/CheckMark";
import { useToast } from "@/components/ui/Toast";
import { setSpeakerTaskTick } from "./actions";

/**
 * Der Haken, den der Speaker selbst setzt (SPK-024, 0149).
 *
 * Nur für Aufgaben, die das Portal **nicht** beobachten kann — „Beim Hotel
 * gemeldet". Ob ein Foto liegt, weiss es selbst; dort bleibt der Haken
 * abgeleitet, sonst stünden zwei Wahrheiten nebeneinander.
 *
 * Der Zustand springt sofort um, ohne auf den Server zu warten: ein Haken, der
 * einen Wimpernschlag später erscheint, fühlt sich an, als hätte der Klick
 * nicht gezählt. Geht es schief, sagt das der Hinweis, und `router.refresh()`
 * holt die Wahrheit zurück.
 */
export function HakenSchalter({
  taskId,
  done,
  label,
  fehler,
}: {
  taskId: string;
  done: boolean;
  label: string;
  fehler: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  return (
    <button
      type="button"
      aria-pressed={done}
      aria-label={label}
      disabled={pending}
      // 44 Pixel Fläche um einen 20er Ring: ein Ziel, das man auf dem Telefon
      // nicht trifft, ist kein Ziel (Design-Regel 7).
      className="-m-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-ct-sm transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      onClick={() =>
        startTransition(async () => {
          const res = await setSpeakerTaskTick(taskId, !done);
          if (!res.ok) toast("error", fehler);
          router.refresh();
        })
      }
    >
      <CheckMark done={done} label={label} />
    </button>
  );
}
