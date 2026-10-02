"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { saveTopics } from "./actions";

type Strings = Record<string, string>;

/**
 * Themen-Kacheln zum An- und Abwählen (TAL-009). Der Knopf sagt, was mit der
 * Newsletter-Einwilligung passiert: Themen wählen ohne Einwilligung heißt
 * zustimmen, alle abwählen heißt widerrufen.
 */
export function ThemenWahl({
  themen,
  gewaehlt,
  newsletter,
  t,
}: {
  themen: { key: string; label: string }[];
  gewaehlt: string[];
  newsletter: boolean;
  t: Strings;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  // Ohne Einwilligung zählen gespeicherte Themen nicht — die Auswahl beginnt leer.
  const [wahl, setWahl] = useState<string[]>(newsletter ? gewaehlt : []);
  const knopf = wahl.length === 0 ? (newsletter ? t.saveNone : t.save) : newsletter ? t.save : t.saveAndConsent;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <p className="ct-small">{newsletter ? t.statusOn : t.statusOff}</p>
        <fieldset>
          <legend className="ct-label mb-2">{t.topics}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {themen.map((th) => (
              <label key={th.key} className="flex min-h-11 items-center gap-3 rounded-ct-md border px-3 py-2">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={wahl.includes(th.key)}
                  disabled={pending}
                  onChange={() => setWahl((w) => (w.includes(th.key) ? w.filter((x) => x !== th.key) : [...w, th.key]))}
                />
                <span>{th.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="ct-help">{wahl.length === 0 && newsletter ? t.hintNone : !newsletter && wahl.length > 0 ? t.hintConsent : t.hintChannel}</p>
        <div>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await saveTopics(wahl);
                if (!res.ok) {
                  toast("error", t.saveFailed);
                  return;
                }
                toast("success", wahl.length === 0 ? t.savedNone : t.saved);
                router.refresh();
              })
            }
          >
            {knopf}
          </Button>
        </div>
      </div>
    </Card>
  );
}
