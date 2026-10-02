"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { sendFeedback } from "./actions";

type Strings = Record<string, string>;
type Option = { value: string; label: string };

/** Die sechs Bewertungen aus der Umfrage FLS26 (Reihenfolge wie dort). */
const FRAGEN = ["overall", "programme", "expo", "masterclasses", "app", "side_events"] as const;

/**
 * Feedback-Fenster (TAL-011). Für den Summit die Fragen der Umfrage FLS26
 * (Bewertungen, Wiederkommen, Hauptgrund, Programmpunkt), sonst Art und Text.
 * Standard ist anonym; der Schalter sagt, was das heißt.
 */
export function FeedbackForm({
  formate,
  arten,
  gruende,
  t,
  rpcMessages,
}: {
  formate: Option[];
  arten: Option[];
  gruende: Option[];
  t: Strings;
  rpcMessages: Strings;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [format, setFormat] = useState("");
  const [kind, setKind] = useState("");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [intent, setIntent] = useState("");
  const [reason, setReason] = useState("");
  const [memorable, setMemorable] = useState("");
  const [body, setBody] = useState("");
  const [anonym, setAnonym] = useState(true);
  const [gesendet, setGesendet] = useState(false);
  const summit = format === "summit";

  if (gesendet) {
    return (
      <Card>
        <p className="ct-h3">{t.thanksTitle}</p>
        <p className="ct-small mt-2">{anonym ? t.thanksAnonymous : t.thanksNamed}</p>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => { setGesendet(false); setFormat(""); setKind(""); setRatings({}); setIntent(""); setReason(""); setMemorable(""); setBody(""); }}>
            {t.again}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-5">
        <Field label={t.format} htmlFor="fb-format" required requiredLabel={t.required}>
          <Select id="fb-format" value={format} placeholder={t.choose} options={formate} onChange={(e) => setFormat(e.target.value)} />
        </Field>

        {summit ? (
          <>
            <fieldset className="flex flex-col gap-3">
              <legend className="ct-label mb-1">{t.ratingsTitle}</legend>
              <p className="ct-help">{t.ratingsHint}</p>
              {FRAGEN.map((q) => (
                <div key={q} className="flex flex-wrap items-center gap-3">
                  <span className="min-w-56 ct-small">{t[`q_${q}`]}</span>
                  <div className="flex gap-1" role="radiogroup" aria-label={t[`q_${q}`]}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label key={n} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-ct-md border has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                        <input type="radio" className="sr-only" name={`r-${q}`} checked={ratings[q] === n} onChange={() => setRatings((r) => ({ ...r, [q]: n }))} />
                        <span className="ct-label tabular-nums">{n}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
            <Field label={t.returnIntent} htmlFor="fb-intent">
              <Select id="fb-intent" value={intent} placeholder={t.choose}
                options={[{ value: "yes", label: t.yes }, { value: "unsure", label: t.unsure }, { value: "no", label: t.no }]}
                onChange={(e) => setIntent(e.target.value)} />
            </Field>
            <Field label={t.mainReason} htmlFor="fb-reason">
              <Select id="fb-reason" value={reason} placeholder={t.choose} options={gruende} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Field label={t.memorable} htmlFor="fb-memo">
              <Textarea id="fb-memo" rows={2} maxLength={1000} value={memorable} onChange={(e) => setMemorable(e.target.value)} />
            </Field>
          </>
        ) : (
          format && (
            <Field label={t.kind} htmlFor="fb-kind">
              <Select id="fb-kind" value={kind} placeholder={t.choose} options={arten} onChange={(e) => setKind(e.target.value)} />
            </Field>
          )
        )}

        {format && (
          <Field label={t.body} htmlFor="fb-body" hint={t.bodyHint}>
            <Textarea id="fb-body" rows={5} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
        )}

        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 h-5 w-5" checked={anonym} onChange={(e) => setAnonym(e.target.checked)} />
          <span>
            <span className="ct-label">{t.anonymous}</span>
            <span className="ct-help block">{anonym ? t.anonymousHint : t.namedHint}</span>
          </span>
        </label>

        <div>
          <Button
            disabled={pending || !format || (!body.trim() && !memorable.trim() && Object.keys(ratings).length === 0)}
            onClick={() =>
              start(async () => {
                const res = await sendFeedback(
                  { format, kind: kind || undefined, ratings: summit ? ratings : undefined, return_intent: summit ? intent || undefined : undefined,
                    main_reason: summit ? reason || undefined : undefined, memorable: summit ? memorable : undefined, body },
                  anonym,
                );
                if (!res.ok) toast("error", rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key);
                else setGesendet(true);
              })
            }
          >
            {t.send}
          </Button>
        </div>
      </div>
    </Card>
  );
}
