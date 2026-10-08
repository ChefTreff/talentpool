"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { aufzaehlung, ticketCodes } from "@/components/partner/ticket-codes";
import { TicketCard } from "@/components/ui/TicketCard";
import { DeadlineCard } from "@/components/ui/DeadlineCard";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import { requestTicketIncrease } from "../actions";
import { REQUEST_PASS_TYPES, type TicketAllocationRow, type TicketRequestRow } from "../types";
import { neuesFenster } from "@/components/ui/neues-fenster";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = {
  active: "success",
  pending_vivenu: "accent",
  error: "warning",
};

const ANFRAGE_TONE: Record<string, BadgeTone> = {
  open: "accent",
  answered: "success",
  closed: "neutral",
};

/**
 * Spalten nach Anzahl der Kontingente (PART-068: „1–4 Sektionen nebeneinander,
 * Breite passt sich der Anzahl an"). Als feste Klassen, nicht zusammengesetzt —
 * Tailwind findet nur Klassen, die wörtlich im Code stehen. Auf schmalen
 * Bildschirmen untereinander, sonst wird aus vier Karten Kleingedrucktes.
 */
const SPALTEN: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 md:grid-cols-2 xl:grid-cols-4",
};

export function TicketView({
  orgId,
  allocations,
  requests,
  passTypes,
  canRequest,
  shopUrl,
  wikiHref,
  dueAt,
  dueText,
  expiredText,
  dueNote,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  orgId: string;
  allocations: TicketAllocationRow[];
  /** Eigene Zusatzanfragen aus `my_ticket_requests` (PART-070). */
  requests: TicketRequestRow[];
  /** Beschriftungen aus dem Vokabular `ticket_type`. */
  passTypes: Record<string, string>;
  canRequest: boolean;
  /**
   * Der eine Ticketshop dieser Organisation (ein Undershop je Org und Edition,
   * `lib/vivenu/allocations.ts`). `null`, solange die Codes noch nicht aktiv
   * sind — dann gibt es keinen Knopf, der ins Leere führt.
   */
  shopUrl: string | null;
  wikiHref: string;
  dueAt: string | null;
  /** Serverseitig formatiert, damit es auch ohne JavaScript dasteht. */
  dueText: string | null;
  /** Gesetzt, wenn die Frist verstrichen ist (vom Server bestimmt). */
  expiredText: string | null;
  /**
   * Konrads Satz zur Frist (PART-071), mit dem Datum aus `deadline.ticket_codes`
   * statt einem fest geschriebenen „31.03." — so stimmt er auch in der nächsten
   * Edition. Nach Ablauf ein anderer Satz, keiner mehr im Imperativ.
   */
  dueNote: string | null;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; none: string; choose: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState({ passType: "partner", additional: "1", text: "" });

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const passLabel = (key: string) => passTypes[key] ?? key;
  // PART-111: ein Code für alle Kategorien — gezeigt wird er einmal, mit dem, was er freischaltet.
  const codes = ticketCodes(allocations);

  async function onCopy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      toast("success", t.copied);
      setTimeout(() => setCopied(null), 3000);
    } catch {
      // Ohne Zwischenablage-Recht bleibt der Code lesbar danebenstehen.
      toast("error", t.copyFailed);
    }
  }

  function onRequest() {
    const additional = Number(draft.additional);
    if (!Number.isInteger(additional) || additional <= 0) {
      toast("error", message("quantity_required"));
      return;
    }
    startTransition(async () => {
      const res = await requestTicketIncrease({
        orgId,
        passType: draft.passType,
        additional,
        text: draft.text,
      });
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.requested);
      setDraft({ passType: "partner", additional: "1", text: "" });
      setAsking(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* PART-067: drei Knöpfe oben, in Konrads Reihenfolge. Einer ist primär —
          der Shop, denn deshalb kommt man auf diese Seite; Nachfragen und
          Nachlesen sind der Ausnahmefall. „Secret Shop" ist weg: das Wort
          stammt aus vivenu und sagt einem Partner nichts. */}
      <div className="flex flex-wrap gap-2">
        {canRequest && (
          <Button variant="secondary" aria-expanded={asking} onClick={() => setAsking((v) => !v)}>
            {t.requestTitle}
          </Button>
        )}
        {shopUrl && (
          <ButtonLink href={shopUrl} {...neuesFenster}>
            {t.toShop}
          </ButtonLink>
        )}
        <ButtonLink variant="ghost" href={wikiHref}>
          {t.toWiki}
        </ButtonLink>
      </div>

      {canRequest && asking && (
        <Card>
          <h2 className="ct-h2 mb-1 text-ink">{t.requestTitle}</h2>
          <p className="ct-help mb-4">{t.requestHint}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.fieldPassType} htmlFor="r-pass">
              <Select
                id="r-pass"
                value={draft.passType}
                options={REQUEST_PASS_TYPES.map((p) => ({ value: p, label: passLabel(p) }))}
                onChange={(e) => setDraft((d) => ({ ...d, passType: e.target.value }))}
              />
            </Field>
            <Field label={t.fieldAdditional} htmlFor="r-count" hint={t.fieldAdditionalHint}>
              <Input
                id="r-count"
                type="number"
                min={1}
                value={draft.additional}
                onChange={(e) => setDraft((d) => ({ ...d, additional: e.target.value }))}
              />
            </Field>
            <Field
              label={t.fieldText}
              htmlFor="r-text"
              hint={t.fieldTextHint}
              className="sm:col-span-2"
            >
              <Textarea
                id="r-text"
                rows={3}
                value={draft.text}
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
              />
            </Field>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button disabled={pending} onClick={onRequest}>
              {t.requestSend}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setAsking(false)}>
              {common.cancel}
            </Button>
          </div>
        </Card>
      )}

      {/* PART-066: die Frist als grosse, laufende Zahl. */}
      {dueAt && dueText && (
        <DeadlineCard
          prominent
          dueAt={dueAt}
          label={t.dueLabel}
          dateText={dueText}
          days={t.countdownDays}
          hours={t.countdownHours}
          soon={t.countdownSoon}
          unitDays={t.unitDays}
          unitHours={t.unitHours}
          unitHour={t.unitHour}
          expired={expiredText}
          note={dueNote ?? undefined}
        />
      )}

      {/* PART-111 (Konrad 05.10.: „nur ein Code“): der Code steht einmal da, mit den Kategorien, die er
          freischaltet, und dem Weg in den Shop direkt darunter (PART-110: „sonst sucht man ihn“). Der
          Knopf ist hier `secondary`: der primäre sitzt oben in der Knopfreihe, und eine Seite hat eine
          primäre Aktion. Gibt es noch keinen Code, steht an seiner Stelle der Satz, dass er kommt — nicht
          auf jeder Karte darunter noch einmal. */}
      {codes.length === 0 ? (
        <Card>
          <CardHeader ebene="h2" title={t.codeTitle} description={t.codesPending} />
        </Card>
      ) : (
        codes.map((c, i) => (
          <Card key={c.code}>
            <CardHeader ebene="h2" title={i === 0 ? t.codeTitle : t.codeTitleMore} description={t.codeBody} />
            <div className="flex flex-wrap items-center gap-3">
              <code className="ct-h3 break-all rounded-ct-sm border bg-surface-hover px-3 py-2 tabular-nums">{c.code}</code>
              <Button size="sm" variant="secondary" onClick={() => onCopy(c.code)}>
                {copied === c.code ? t.copied : t.copy}
              </Button>
            </div>
            <p className="ct-help mt-3">
              {t.codeCovers.replace("{types}", aufzaehlung(c.passTypes.map(passLabel), dateLocale))}
            </p>
            {shopUrl && (
              <div className="mt-4">
                <ButtonLink href={shopUrl} variant="secondary" {...neuesFenster}>
                  {t.toShop}
                </ButtonLink>
              </div>
            )}
          </Card>
        ))
      )}

      {/* PART-068: Kontingente nebeneinander, bis zu vier — seit PART-111 die Übersicht „eingelöst von
          Menge“ je Kategorie, ohne eigenen Code. */}
      <section aria-labelledby="h-kontingente">
        <h2 id="h-kontingente" className="ct-h2 mb-3 text-ink">
          {t.allocationsTitle}
        </h2>
        <ul className={cn("grid gap-6", SPALTEN[Math.min(Math.max(allocations.length, 1), 4)])}>
          {allocations.map((a) => (
            <li key={a.id}>
              <TicketCard
                passType={t.allocationEyebrow}
                title={passLabel(a.pass_type)}
                count={`${a.used_count} / ${a.quantity}`}
                countLabel={t.used}
                status={
                  <Badge tone={TONE[a.status] ?? "neutral"}>
                    {t[`status_${a.status}`] ?? a.status}
                  </Badge>
                }
                footer={
                  // `pending_vivenu` und `error` sehen für den Partner gleich aus: die Menge steht, der
                  // Code kommt noch (Kontrakt B5). Gibt es schon einen Code, kommt diese Kategorie unter
                  // denselben; gibt es noch keinen, sagt es die Karte „Euer Code“ oben.
                  a.status !== "active" && codes.length > 0 ? <p className="ct-help">{t.rowPending}</p> : undefined
                }
              />
            </li>
          ))}
        </ul>
      </section>

      {/* PART-070: was angefragt wurde und wie es steht. Nur mit Anfragen —
          eine leere Sektion wäre eine Frage ohne Anlass. */}
      {requests.length > 0 && (
        <section>
          <h2 className="ct-h2 text-ink">{t.extraTitle}</h2>
          <p className="ct-help mt-1">{t.extraLead}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {requests.map((r) => (
              <li key={r.id} className="rounded-ct-md border border-border bg-surface px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="ct-label text-ink">
                    {t.extraLine
                      .replace("{n}", String(r.quantity))
                      .replace("{type}", passLabel(r.pass_type))}
                  </span>
                  <Badge tone={ANFRAGE_TONE[r.status] ?? "neutral"}>
                    {t[`extra_${r.status}`] ?? r.status}
                  </Badge>
                </div>
                <p className="ct-help mt-1">
                  {t.extraAsked.replace("{date}", datum.format(new Date(r.created_at)))}
                  {r.answered_at &&
                    ` · ${t.extraAnswered.replace("{date}", datum.format(new Date(r.answered_at)))}`}
                </p>
                {r.answer && <p className="ct-small mt-2 leading-6">{r.answer}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* PART-071: das Wesentliche aus dem Wiki direkt hier. Der zweite Schritt
          nach dem Kauf — die Personalisierung — sorgt jedes Jahr für
          Verwirrung; deshalb steht er als eigener, nummerierter Schritt da
          und nicht als Nebensatz. Die Akkreditierungszeiten stehen bewusst
          **nicht** hier: sie hängen an der Edition (Wochentage wechseln) und
          gehören ins Wiki. */}
      <section>
        <h2 className="ct-h2 text-ink">{t.howTitle}</h2>
        <ol className="mt-3 flex flex-col gap-3">
          <li className="rounded-ct-md border border-border bg-surface px-4 py-3">
            <p className="ct-label text-ink">{t.step1Title}</p>
            <p className="ct-small mt-1 leading-6">{t.step1Body}</p>
          </li>
          <li className="rounded-ct-md border border-border bg-surface px-4 py-3">
            <p className="ct-label text-ink">{t.step2Title}</p>
            <p className="ct-small mt-1 leading-6">{t.step2Body}</p>
          </li>
        </ol>
        <ul className="ct-small mt-4 flex list-disc flex-col gap-1 pl-5 leading-6">
          <li>{t.ruleCodes}</li>
          <li>{t.ruleOwnTicket}</li>
        </ul>
      </section>
    </div>
  );
}
