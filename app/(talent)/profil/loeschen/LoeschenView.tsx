"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { requestDeletion } from "./actions";

type Strings = Record<string, string>;

/**
 * Der Auslöser für „Profil löschen".
 *
 * Drei Dinge stehen bewusst **vor** dem Knopf und nicht dahinter:
 *
 * * **Was löschen heisst.** Der Datensatz wird anonymisiert, nicht physisch
 *   entfernt: Name, Kontaktdaten und Zugang fallen weg, Zahlen und Bestellungen
 *   bleiben ohne Personenbezug bestehen. Wer etwas anderes erwartet, soll es
 *   vorher erfahren.
 * * **Die Sperrliste.** Die Adresse kommt als Hash darauf — das ist der Grund,
 *   warum danach keine Mail mehr kommt, auch keine Bestätigung.
 * * **Die Hürden.** Steht eine Rolle, eine Zusage oder eine Organisation im
 *   Weg, sagt die Seite das hier, und der Knopf verspricht dann einen Antrag
 *   statt einer Löschung.
 */
export function LoeschenView({
  blockers,
  pendingSince,
  dateLocale,
  t,
  blockerLabels,
  common,
  rpcMessages,
}: {
  blockers: string[];
  pendingSince: string | null;
  dateLocale: string;
  t: Strings;
  blockerLabels: Record<string, string>;
  common: { cancel: string };
  rpcMessages: Record<string, string>;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [grund, setGrund] = useState("");
  const [frage, setFrage] = useState(false);
  const [fertig, setFertig] = useState<"done" | "pending" | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const sofort = blockers.length === 0;
  const zeit = new Intl.DateTimeFormat(dateLocale, { dateStyle: "long" });

  function loeschen() {
    start(async () => {
      const res = await requestDeletion(grund);
      setFrage(false);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      setFertig(res.status);
    });
  }

  // Nach dem Löschen ist der Zugang weg — es gibt nichts mehr zu bedienen, nur
  // noch etwas zu sagen.
  if (fertig === "done") {
    return (
      <Card>
        <h2 className="ct-h3">{t.doneTitle}</h2>
        <p className="mt-2">{t.doneBody}</p>
        <p className="ct-help mt-4 text-muted">{t.doneSuppression}</p>
      </Card>
    );
  }
  if (fertig === "pending") {
    return (
      <Card>
        <h2 className="ct-h3">{t.pendingTitle}</h2>
        <p className="mt-2">{t.pendingBody}</p>
      </Card>
    );
  }

  if (pendingSince) {
    return (
      <Card>
        <h2 className="ct-h3">{t.pendingTitle}</h2>
        <p className="mt-2">
          {t.pendingSince.replace("{date}", zeit.format(new Date(pendingSince)))}
        </p>
        <p className="ct-help mt-4 text-muted">{t.pendingBody}</p>
      </Card>
    );
  }

  return (
    <>
      <Card className="mb-4">
        <h2 className="ct-h3">{t.whatTitle}</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5">
          <li>{t.whatAnonymised}</li>
          <li>{t.whatKept}</li>
          <li>{t.whatSuppression}</li>
          <li>{t.whatAccess}</li>
          <li>{t.whatAudit}</li>
        </ul>
      </Card>

      {!sofort && (
        <Card className="mb-4">
          <h2 className="ct-h3">{t.blockersTitle}</h2>
          <p className="ct-help mt-2 text-muted">{t.blockersLead}</p>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5">
            {blockers.map((b) => (
              <li key={b}>{blockerLabels[b] ?? b}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <Field label={t.fieldReason} htmlFor="grund" hint={t.fieldReasonHint}>
          <Textarea
            id="grund"
            rows={3}
            maxLength={500}
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
          />
        </Field>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="destructive" disabled={pending} onClick={() => setFrage(true)}>
            {sofort ? t.submitDelete : t.submitRequest}
          </Button>
          <Link href="/profil" className="ct-link">
            {common.cancel}
          </Link>
        </div>
      </Card>

      {frage && (
        <ConfirmDialog
          title={sofort ? t.confirmDeleteTitle : t.confirmRequestTitle}
          body={sofort ? t.confirmDeleteBody : t.confirmRequestBody}
          confirmLabel={sofort ? t.submitDelete : t.submitRequest}
          cancelLabel={common.cancel}
          pending={pending}
          onConfirm={loeschen}
          onCancel={() => setFrage(false)}
        />
      )}
    </>
  );
}
