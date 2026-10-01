"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { openDeletion } from "./actions";

type Strings = Record<string, string>;

/**
 * Löschung durch das Team anlegen (ADM-031, Art. 17 DSGVO).
 *
 * Für die Fälle, in denen die Person es nicht selbst kann: die Bitte kam per
 * Mail, oder es gibt gar kein Konto (importierte Kontakte). Der Knopf löscht
 * **nicht** — er legt einen Antrag an, der in der Warteschlange mit den Hürden
 * angezeigt und dort bestätigt wird. Ein Weg zum Löschen, nicht zwei.
 */
export function Loeschung({
  personId,
  deletedAt,
  pendingSince,
  dateLocale,
  t,
  rpcMessages,
}: {
  personId: string;
  deletedAt: string | null;
  pendingSince: string | null;
  dateLocale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const datum = (iso: string) => new Date(iso).toLocaleDateString(dateLocale);

  function onOpen() {
    startTransition(async () => {
      const res = await openDeletion(personId, note);
      if (!res.ok) {
        setFehler((rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      setFehler(null);
      setNote("");
      toast("success", t.deletionOpened);
      router.refresh();
    });
  }

  return (
    <Card id="loeschung" className="mt-4">
      <h2 className="ct-h2 mb-3 text-ink">{t.deletionTitle}</h2>
      {deletedAt ? (
        <p className="ct-small">{t.deletionDone.replace("{date}", datum(deletedAt))}</p>
      ) : pendingSince ? (
        <p className="ct-small">
          {t.deletionPending.replace("{date}", datum(pendingSince))}{" "}
          <Link href="/admin/loeschantraege" className="ct-link">
            {t.deletionToQueue}
          </Link>
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="ct-help">{t.deletionLead}</p>
          <Field label={t.deletionNote} htmlFor="loeschung-notiz" hint={t.deletionNoteHint} error={fehler ?? undefined}>
            <Textarea id="loeschung-notiz" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div>
            <Button variant="secondary" disabled={pending} onClick={onOpen}>
              {t.deletionOpen}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
