"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { pruefzustand } from "@/lib/produktion/staende";
import { setBoothReview } from "./actions";
import type { BoothReview } from "./types";

type Strings = Record<string, string>;

/**
 * Ein Prüfpunkt eines Stands (PROD-005): „Bestellungen passen zur
 * Standgröße“ und was sonst im Vokabular `booth_review_item` dazukommt.
 *
 * Drei Zustände — offen, passt, passt nicht (mit Notiz). Ändert der Partner
 * seine Bestellung nach der Prüfung, steht daneben „Bestellung seitdem
 * geändert“: die Prüfung gilt dann als veraltet, bis jemand sie neu setzt.
 * Fehler stehen im Formular, nicht im Toast: wer eine Notiz vergessen hat,
 * muss die Stelle sehen.
 */
export function Pruefung({
  orgEditionId,
  review,
  locale,
  t,
  rpcMessages,
}: {
  orgEditionId: string;
  review: BoothReview;
  locale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notizOffen, setNotizOffen] = useState(false);
  const [notiz, setNotiz] = useState(review.status === "problem" ? (review.note ?? "") : "");
  const [fehler, setFehler] = useState<string | null>(null);
  const zustand = pruefzustand(review);
  const bezeichnung = locale === "en" ? review.label_en : review.label_de;
  const zeit = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });
  const meldung = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  function setzen(status: "ok" | "problem" | "open", text?: string) {
    setFehler(null);
    startTransition(async () => {
      const res = await setBoothReview({ orgEditionId, item: review.item_key, status: status, note: text ?? null });
      if (!res.ok) {
        setFehler(meldung(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      setNotizOffen(false);
      router.refresh();
    });
  }

  function problemSpeichern() {
    if (!notiz.trim()) {
      setFehler(t.reviewNoteRequired);
      return;
    }
    setzen("problem", notiz.trim());
  }

  const ton = zustand === "ok" ? "success" : zustand === "problem" ? "error" : "neutral";
  const zustandText = zustand === "ok" ? t.reviewOk : zustand === "problem" ? t.reviewProblem : t.reviewOpen;

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ct-label text-ink">{bezeichnung}</span>
        <Badge tone={ton}>{zustandText}</Badge>
        {review.stale && <Badge tone="warning">{t.reviewStale}</Badge>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" disabled={pending || zustand === "ok"} onClick={() => setzen("ok")}>
            {t.reviewSetOk}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            aria-expanded={notizOffen}
            onClick={() => {
              setFehler(null);
              setNotizOffen((offen) => !offen);
            }}
          >
            {t.reviewSetProblem}
          </Button>
          {zustand !== "open" && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setzen("open")}>
              {t.reviewReset}
            </Button>
          )}
        </div>
      </div>

      {(review.note || review.checked_at) && !notizOffen && (
        <p className="ct-help">
          {review.note}
          {review.note && review.checked_at ? " — " : ""}
          {review.checked_at &&
            t.checkedBy.replace("{name}", review.checked_by_name ?? "—").replace("{time}", zeit.format(new Date(review.checked_at)))}
        </p>
      )}

      {notizOffen && (
        <form
          className="flex flex-wrap items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            problemSpeichern();
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              placeholder={t.reviewNotePlaceholder}
              aria-label={t.reviewNoteLabel}
              maxLength={1000}
              invalid={!!fehler}
              autoFocus
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" loading={pending}>
            {t.reviewSave}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setNotizOffen(false)}>
            {t.cancel}
          </Button>
        </form>
      )}

      {fehler && (
        <p role="alert" className="ct-small text-error-ink">
          {fehler}
        </p>
      )}
    </div>
  );
}
