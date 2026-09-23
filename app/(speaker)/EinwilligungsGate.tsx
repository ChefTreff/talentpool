"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { saveSpeakerConsents } from "./speaker/actions";

/**
 * Die Einwilligungen beim ersten Anmelden (SPK-024).
 *
 * Konrad, 21.09.: „Die Einwilligung kommt beim ersten Anmelden als
 * Pflichtformular — ohne sie funktionieren große Teile des Portals nicht."
 *
 * **Pflicht ist die Frage, nicht die Antwort.** Wer ankreuzen *muss*, um
 * weiterzukommen, willigt nicht ein — er gehorcht. Eine so erzwungene
 * Einwilligung ist keine (Art. 7 Abs. 4 DSGVO), und sie wäre auch praktisch
 * wertlos: sie sagt uns nichts darüber, ob jemand wirklich fotografiert werden
 * will. Der Dialog verlangt deshalb eine **Entscheidung**, kein Ja. Wer alles
 * ablehnt, kommt genauso durch — das Nein wird versioniert festgehalten, und
 * gefragt wird erst wieder, wenn sich der Text ändert.
 *
 * **Er lässt sich nicht wegdrücken**, weil er sonst keiner wäre. Damit das
 * keine Sackgasse ist, führt ein Weg heraus: scheitert das Speichern, sagt der
 * Hinweis es, und der Dialog bleibt bedienbar.
 *
 * **Die Assistenz sieht ihn nie.** Sie darf keine Einwilligung geben (Antwort
 * 58) — ein Dialog, den sie nicht erfüllen kann, würde sie aussperren. Das
 * entscheidet die Ebene darüber, in `layout.tsx`.
 */
export function EinwilligungsGate({
  keys,
  t,
  rpcMessages,
}: {
  /** Die Einwilligungen in der Reihenfolge des Formulars, mit ihrem Text. */
  keys: { key: string; label: string }[];
  t: { title: string; lead: string; freeChoice: string; submit: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [werte, setWerte] = useState<Record<string, boolean>>(
    Object.fromEntries(keys.map((k) => [k.key, false])),
  );
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  return (
    <Modal label={t.title} blocking onCancel={() => {}}>
      <h2 className="ct-h3 mb-2 text-ink">{t.title}</h2>
      <p className="ct-small mb-1 leading-6">{t.lead}</p>
      <p className="ct-help mb-4">{t.freeChoice}</p>

      <div className="flex flex-col gap-3">
        {keys.map((k) => (
          <label key={k.key} className="flex items-start gap-2 ct-small">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={werte[k.key] === true}
              onChange={(e) => setWerte((w) => ({ ...w, [k.key]: e.target.checked }))}
            />
            <span>{k.label}</span>
          </label>
        ))}
      </div>

      <div className="mt-6">
        <Button
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await saveSpeakerConsents(werte);
              if (!res.ok) {
                toast("error", message(res.key));
                return;
              }
              router.refresh();
            })
          }
        >
          {t.submit}
        </Button>
      </div>
    </Modal>
  );
}
