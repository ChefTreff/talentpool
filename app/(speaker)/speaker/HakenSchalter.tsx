"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckMark } from "@/components/ui/CheckMark";
import { useToast } from "@/components/ui/Toast";
import { setSpeakerStepReopened, setSpeakerTaskTick } from "./actions";

/**
 * Der Haken, den der Speaker selbst setzt — für zweierlei:
 *
 * - **Eine Aufgabe des Teams** (`taskId`, SPK-024, 0149): „Beim Hotel gemeldet“ kann das Portal nicht beobachten, der Haken ist die Aussage der Speakerin.
 * - **Ein Punkt, den das Portal selbst ableitet** (`stepKey`, SPK-082): das Foto liegt, die Einwilligung steht — der Punkt steht als erledigt da. Der Haken
 *   öffnet ihn **wieder** (und hakt ihn danach wieder ab). Er ist nur klickbar, solange das Portal den Punkt als erledigt kennt; vorher gäbe es „abgehakt,
 *   aber kein Foto da“. Gespeichert wird die Ausnahme „wieder geöffnet“, nicht der Haken — die abgeleitete Wahrheit bleibt, wie sie ist.
 *
 * Bei der Aufgabe sagt der Name den Zustand (`aria-pressed`), beim Punkt die Aktion („Wieder öffnen“ / „Als erledigt abhaken“): dort ist der Zustand die
 * Folge der Arbeit, der Knopf der Weg zurück.
 *
 * Die Seite lädt nach der Antwort neu (`router.refresh()`): geht es schief — etwa weil das Foto inzwischen gelöscht wurde —, sagt das der Hinweis, und die
 * Liste zeigt die Wahrheit.
 */
export function HakenSchalter(
  props: { done: boolean; label: string; fehler: string } & ({ taskId: string } | { stepKey: string }),
) {
  const { done, label, fehler } = props;
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const istPunkt = "stepKey" in props;

  return (
    <button
      type="button"
      aria-pressed={istPunkt ? undefined : done}
      aria-label={label}
      disabled={pending}
      // 44 Pixel Fläche um einen 20er Ring: ein Ziel, das man auf dem Telefon
      // nicht trifft, ist kein Ziel (Design-Regel 7).
      className="-m-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-ct-sm transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      onClick={() =>
        startTransition(async () => {
          // Punkt: steht er als erledigt da, öffnet der Klick ihn (`reopened = done`); steht er offen, hakt der Klick ihn wieder ab.
          const res = "stepKey" in props ? await setSpeakerStepReopened(props.stepKey, done) : await setSpeakerTaskTick(props.taskId, !done);
          if (!res.ok) toast("error", fehler);
          router.refresh();
        })
      }
    >
      <CheckMark done={done} label={label} />
    </button>
  );
}
