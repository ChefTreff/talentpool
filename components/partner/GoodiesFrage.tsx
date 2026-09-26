"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/Toast";

type Texte = {
  question: string;
  yes: string;
  no: string;
  none: string;
  hintYes: string;
  wiki: string;
  saved: string;
};

/**
 * „Wollt ihr Goodies einsenden?“ an einer Masterclass (PART-054, Konrad 22.09.:
 * „der Haken steht bei uns, damit das Team es sieht und später nachhält“).
 *
 * Dieselbe Maske im Partner-Portal und im Admin — der Unterschied ist nur, wer
 * speichert (`save`: `updateFormatDetails` bzw. `adminUpdateFormatDetails`, beide
 * über `partner_update_session`). Die Angabe steht in `format_details.goodies_planned`;
 * `format_details` wird als Ganzes geschrieben, deshalb gehen die übrigen Angaben
 * der Session mit.
 *
 * Gespeichert wird beim Klick. Scheitert es, springt die Auswahl zurück und
 * der Grund steht unter den Knöpfen, nicht in einem Toast.
 */
export function GoodiesFrage({
  sessionId,
  details,
  canEdit,
  save,
  wikiHref,
  t,
  rpcMessages,
}: {
  sessionId: string;
  details: Record<string, unknown> | null;
  canEdit: boolean;
  save: (details: Record<string, unknown>) => Promise<{ ok: boolean; key?: string; detail?: string }>;
  wikiHref: string;
  t: Texte;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const gespeichert = typeof details?.goodies_planned === "boolean" ? details.goodies_planned : null;
  const [auswahl, setAuswahl] = useState<boolean | null>(gespeichert);
  const [fehler, setFehler] = useState<string | null>(null);

  function setzen(neu: boolean) {
    if (neu === auswahl) return;
    const vorher = auswahl;
    setAuswahl(neu);
    setFehler(null);
    startTransition(async () => {
      const res = await save({ ...(details ?? {}), goodies_planned: neu });
      if (!res.ok) {
        setAuswahl(vorher);
        const text = rpcMessages[res.key ?? "unknown"] ?? rpcMessages.unknown ?? res.key ?? "";
        setFehler(res.detail ? `${text} (${res.detail})` : text);
        return;
      }
      toast("success", t.saved);
      router.refresh();
    });
  }

  return (
    <fieldset disabled={!canEdit || pending} className="min-w-0">
      <legend className="ct-label text-ink">{t.question}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {[true, false].map((wert) => (
          <label
            key={String(wert)}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-2 rounded-ct-md border-2 px-3 transition-colors",
              auswahl === wert ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-hover",
            )}
          >
            <input
              type="radio"
              name={`goodies-${sessionId}`}
              className="h-5 w-5 shrink-0"
              checked={auswahl === wert}
              onChange={() => setzen(wert)}
            />
            <span className="ct-small text-ink">{wert ? t.yes : t.no}</span>
          </label>
        ))}
      </div>
      {auswahl === null && <p className="ct-help mt-2">{t.none}</p>}
      {auswahl === true && (
        <p className="ct-small mt-3 leading-6">
          {t.hintYes}{" "}
          <Link className="ct-link" href={wikiHref}>
            {t.wiki}
          </Link>
        </p>
      )}
      {fehler && (
        <p className="ct-help mt-2 text-error-ink" role="alert">
          {fehler}
        </p>
      )}
    </fieldset>
  );
}
