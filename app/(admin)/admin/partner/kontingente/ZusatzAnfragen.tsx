"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { answerRequest } from "../actions";
import type { AdminTicketRequest } from "../types";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = { open: "accent", answered: "success", closed: "neutral" };

/**
 * Zusatzanfragen neben den Kontingenten (PART-070).
 *
 * **Anfrage und Freigabe an einem Ort.** Vorher kam die Anfrage als
 * „Messeshop-Anfrage" an und wurde unter Bestellungen beantwortet, das
 * Kontingent aber hier erhöht — zwei Seiten für einen Vorgang, und nichts
 * verband sie. Jetzt steht die offene Anfrage über der Tabelle, in der das
 * Kontingent erhöht wird; die Antwort geht über dieselbe RPC wie im Messeshop
 * (`shop_request_answer`) und erscheint beim Partner in „Zusatzkontingent".
 *
 * Die Reihenfolge steht im Hinweis, weil sie zählt: erst das Kontingent
 * erhöhen, dann antworten. Andersherum liest der Partner „freigegeben" und
 * findet im Shop noch die alte Zahl.
 */
export function ZusatzAnfragen({
  rows,
  passTypes,
  dateLocale,
  t,
  rpcMessages,
}: {
  rows: AdminTicketRequest[];
  passTypes: Record<string, string>;
  dateLocale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [antwort, setAntwort] = useState<Record<string, string>>({});
  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" });
  const offen = rows.filter((r) => r.status === "open").length;

  function senden(id: string, status: "answered" | "closed") {
    startTransition(async () => {
      const res = await answerRequest(id, antwort[id] ?? "", status);
      if (!res.ok) {
        toast("error", rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key);
        return;
      }
      toast("success", t.extraAnswered);
      setAntwort((a) => ({ ...a, [id]: "" }));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title={t.extraAdminTitle}
        description={`${t.extraAdminLead} · ${offen} ${t.extraAdminOpen}`}
      />
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-ct-md border border-border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="ct-label text-ink">
                {r.org_name} · {r.quantity} × {passTypes[r.pass_type] ?? r.pass_type}
              </span>
              <Badge tone={TONE[r.status] ?? "neutral"}>{t[`extraStatus_${r.status}`] ?? r.status}</Badge>
            </div>
            <p className="ct-help mt-1">
              {datum.format(new Date(r.created_at))}
              {r.created_by_name ? ` · ${r.created_by_name}` : ""}
            </p>
            <p className="ct-small mt-2 leading-6">{r.text}</p>
            {r.answer && (
              <p className="ct-small mt-2 leading-6 text-muted">
                {t.extraAdminAnswer}: {r.answer}
              </p>
            )}
            {r.status === "open" && (
              <div className="mt-3 flex flex-col gap-3">
                <Field label={t.extraAdminAnswerLabel} htmlFor={`za-${r.id}`} hint={t.extraAdminAnswerHint}>
                  <Textarea
                    id={`za-${r.id}`}
                    rows={2}
                    value={antwort[r.id] ?? ""}
                    onChange={(e) => setAntwort((a) => ({ ...a, [r.id]: e.target.value }))}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={pending} onClick={() => senden(r.id, "answered")}>
                    {t.extraAdminSend}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => senden(r.id, "closed")}>
                    {t.extraAdminClose}
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
