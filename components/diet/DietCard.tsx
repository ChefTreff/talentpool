"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { saveDiet } from "./actions";

type Strings = Record<string, string>;

/**
 * Ernährung — zwei Angaben, aus zwei Gründen getrennt.
 *
 * Die **Auswahl** ist die Zahl, mit der beim Caterer bestellt wird. Der
 * **Freitext** ist der Satz, den die Küche liest. Eine Auswahlliste für
 * Allergien wäre falsch: Allergien sind keine Kategorien, und eine
 * unvollständige Liste lädt dazu ein, das Falsche anzuklicken.
 *
 * Beides ist **freiwillig**, und das steht auch da. Der Freitext kann eine
 * Gesundheitsangabe sein; er verlässt die Datenbank nie zusammen mit einem
 * Namen (Migration 0100). Deshalb steht hier auch der Hinweis, dass eine
 * kurze Angabe reicht — Datensparsamkeit ist an dieser Stelle kein Formalismus.
 *
 * Nur die Person selbst trägt hier ein. Eine Assistenz sähe ein leeres
 * Formular — sie darf die Angabe nicht lesen — und würde beim Speichern eine
 * hinterlegte Allergie löschen.
 */
export function DietCard({
  diet,
  note,
  path,
  options,
  t,
  common,
  rpcMessages,
}: {
  diet: string | null;
  note: string | null;
  /** Seite, die nach dem Speichern neu geladen wird. */
  path: string;
  options: Record<string, string>;
  t: Strings;
  common: { save: string; choose: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [wahl, setWahl] = useState(diet ?? "");
  const [text, setText] = useState(note ?? "");

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  function onSave() {
    startTransition(async () => {
      const res = await saveDiet({ diet: wahl || null, note: text || null, path });
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.saved);
      router.refresh();
    });
  }

  return (
    <Card>
      <h2 className="ct-h3 text-ink">{t.title}</h2>
      <p className="ct-small mt-1 leading-6">{t.body}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={t.choice} htmlFor="diet" hint={t.choiceHint}>
          <Select
            id="diet"
            value={wahl}
            placeholder={common.choose}
            options={Object.entries(options).map(([value, label]) => ({ value, label }))}
            onChange={(e) => setWahl(e.target.value)}
          />
        </Field>
        <Field label={t.note} htmlFor="diet-note" hint={t.noteHint}>
          {/* Kurztext statt Textfeld (SPK-033, Konrad 22.09.): ein Satz
              reicht, und ein grosses Feld lädt zu mehr ein, als wir für das
              Catering brauchen. */}
          <Input
            id="diet-note"
            maxLength={300}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
      </div>

      <p className="ct-help mt-3">{t.privacy}</p>

      <div className="mt-4">
        <Button disabled={pending} onClick={onSave}>
          {common.save}
        </Button>
      </div>
    </Card>
  );
}
