"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { SuchFeld } from "@/components/ui/SuchFeld";
import { loadDetail, requeue } from "./actions";

type Strings = Record<string, string>;

/** Zeile aus `mail_log_admin()` (Migration 0113). */
export type LogZeile = {
  id: number;
  to_email: string;
  person_id: string | null;
  person_name: string | null;
  template_key: string;
  locale: string;
  subject: string | null;
  status: string;
  error: string | null;
  provider_id: string | null;
  queued_at: string;
  sent_at: string | null;
  resend_of: number | null;
  total: number;
};

/** Was `mail_log_detail()` zurückgibt — die Felder der Zeile plus `vars`. */
type Detail = {
  id: number;
  to_email: string;
  person_name: string | null;
  template_key: string;
  locale: string;
  subject: string | null;
  status: string;
  error: string | null;
  provider: string | null;
  provider_id: string | null;
  related_type: string | null;
  related_id: string | null;
  queued_at: string;
  sent_at: string | null;
  attempts: number;
  resend_of: number | null;
  vars: Record<string, unknown>;
  resendable: boolean;
};

const TONES: Record<string, BadgeTone> = {
  sent: "success",
  delivered: "success",
  queued: "neutral",
  suppressed: "warning",
  bounced: "error",
  failed: "error",
};

/**
 * Das Mail-Protokoll als Arbeitsmittel.
 *
 * Die häufigste Frage im Support ist „ist die Mail angekommen?". Sie lässt sich
 * nur beantworten, wenn man suchen kann — deshalb stehen die Filter in der URL
 * und nicht im Komponentenzustand: eine Zeile, die jemand gefunden hat, ist
 * damit als Link weiterzugeben.
 *
 * Erneut senden reiht **neu ein**, statt sofort zu verschicken. Die Rückfrage
 * sagt beides: dass eine zweite Zeile entsteht und dass die **heutige** Fassung
 * der Vorlage gerendert wird — sonst wundert sich jemand, warum die zweite Mail
 * anders aussieht als die erste.
 */
export function ProtokollView({
  zeilen,
  gesamt,
  seite,
  proSeite,
  vorlagen,
  statusOptionen,
  dateLocale,
  t,
  statusLabels,
  common,
  rpcMessages,
}: {
  zeilen: LogZeile[];
  gesamt: number;
  seite: number;
  proSeite: number;
  vorlagen: SelectOption[];
  statusOptionen: SelectOption[];
  dateLocale: string;
  t: Strings;
  statusLabels: Record<string, string>;
  common: { cancel: string; close: string; none: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const pfad = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [frage, setFrage] = useState<Detail | null>(null);

  const zeit = new Intl.DateTimeFormat(dateLocale, { dateStyle: "short", timeStyle: "short" });
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const label = (status: string) => statusLabels[status] ?? status;
  const letzte = Math.max(1, Math.ceil(gesamt / proSeite));

  /** Einen Filter setzen heisst: neue URL, Seite zurück auf 1. */
  function filtern(feld: string, wert: string) {
    const next = new URLSearchParams(params.toString());
    if (wert) next.set(feld, wert);
    else next.delete(feld);
    next.delete("seite");
    router.push(`${pfad}?${next.toString()}`);
  }

  function blaettern(zu: number) {
    const next = new URLSearchParams(params.toString());
    if (zu <= 1) next.delete("seite");
    else next.set("seite", String(zu));
    router.push(`${pfad}?${next.toString()}`);
  }

  function oeffnen(id: number) {
    start(async () => {
      const res = await loadDetail(id);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      setDetail(res.data as unknown as Detail);
    });
  }

  function erneut(d: Detail) {
    start(async () => {
      const res = await requeue(d.id);
      setFrage(null);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      setDetail(null);
      toast("success", t.resendOk.replace("{id}", String(res.data)));
      router.refresh();
    });
  }

  const gefiltert = ["q", "status", "vorlage", "von", "bis"].some((f) => params.get(f));

  return (
    <>
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={t.filterSearch} htmlFor="f-q" hint={t.filterSearchHint}>
            <SuchFeld
              id="f-q"
              defaultValue={params.get("q") ?? ""}
              onBlur={(e) => filtern("q", e.target.value.trim())}
              onKeyDown={(e) => {
                if (e.key === "Enter") filtern("q", (e.target as HTMLInputElement).value.trim());
              }}
            />
          </Field>
          <Field label={t.filterStatus} htmlFor="f-status">
            <Select
              id="f-status"
              placeholder={t.anyStatus}
              options={statusOptionen}
              value={params.get("status") ?? ""}
              onChange={(e) => filtern("status", e.target.value)}
            />
          </Field>
          <Field label={t.filterTemplate} htmlFor="f-vorlage">
            <Select
              id="f-vorlage"
              placeholder={t.anyTemplate}
              options={vorlagen}
              value={params.get("vorlage") ?? ""}
              onChange={(e) => filtern("vorlage", e.target.value)}
            />
          </Field>
          <Field label={t.filterFrom} htmlFor="f-von">
            <Input
              id="f-von"
              type="date"
              value={params.get("von") ?? ""}
              onChange={(e) => filtern("von", e.target.value)}
            />
          </Field>
          <Field label={t.filterTo} htmlFor="f-bis">
            <Input
              id="f-bis"
              type="date"
              value={params.get("bis") ?? ""}
              onChange={(e) => filtern("bis", e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="ct-help text-muted">{t.count.replace("{n}", String(gesamt))}</span>
          {gefiltert && (
            // Ein Link, kein Knopf: Zurücksetzen heißt „zur Seite ohne Filter“ —
            // so geht auch Strg-/Cmd-Klick (QS-014, Web Interface Guidelines).
            <ButtonLink href={pfad} size="sm" variant="ghost">
              {t.reset}
            </ButtonLink>
          )}
        </div>
      </Card>

      {zeilen.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={gefiltert ? t.emptyFiltered : t.emptyBody} />
      ) : (
        <>
          <Table>
            <Thead>
              <Th>{t.colTime}</Th>
              <Th>{t.colTo}</Th>
              <Th>{t.colSubject}</Th>
              <Th>{t.colStatus}</Th>
              <Th>{t.colAction}</Th>
            </Thead>
            <Tbody>
              {zeilen.map((z) => (
                <Tr key={z.id}>
                  <Td className="whitespace-nowrap text-muted">{zeit.format(new Date(z.queued_at))}</Td>
                  <Td>
                    <span className="ct-label">{z.person_name ?? z.to_email}</span>
                    {z.person_name && <div className="ct-help text-muted">{z.to_email}</div>}
                  </Td>
                  <Td>
                    {z.subject ?? common.none}
                    <div className="ct-help text-muted">
                      {z.template_key} ({z.locale})
                      {z.resend_of !== null && ` · ${t.resendOf.replace("{id}", String(z.resend_of))}`}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={TONES[z.status] ?? "neutral"}>{label(z.status)}</Badge>
                  </Td>
                  <Td>
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => oeffnen(z.id)}>
                      {t.open}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>

          {letzte > 1 && (
            <div className="mt-4 flex items-center gap-3">
              <Button size="sm" variant="secondary" disabled={seite <= 1} onClick={() => blaettern(seite - 1)}>
                {t.prev}
              </Button>
              <span className="ct-help text-muted">
                {t.page.replace("{n}", String(seite)).replace("{of}", String(letzte))}
              </span>
              <Button size="sm" variant="secondary" disabled={seite >= letzte} onClick={() => blaettern(seite + 1)}>
                {t.next}
              </Button>
            </div>
          )}
        </>
      )}

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.subject ?? t.detailTitle}
        closeLabel={common.close}
        footer={
          detail && (
            <div className="flex items-center gap-3">
              <Button disabled={!detail.resendable || pending} onClick={() => setFrage(detail)}>
                {t.resend}
              </Button>
              {!detail.resendable && <span className="ct-help text-muted">{t.notResendable}</span>}
            </div>
          )
        }
      >
        {detail && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <Eintrag label={t.detailTo} wert={detail.person_name ? `${detail.person_name} · ${detail.to_email}` : detail.to_email} />
            <Eintrag label={t.detailTemplate} wert={`${detail.template_key} (${detail.locale})`} />
            <Eintrag label={t.detailStatus} wert={label(detail.status)} />
            <Eintrag label={t.detailQueued} wert={zeit.format(new Date(detail.queued_at))} />
            <Eintrag label={t.detailSent} wert={detail.sent_at ? zeit.format(new Date(detail.sent_at)) : common.none} />
            <Eintrag label={t.detailAttempts} wert={String(detail.attempts)} />
            <Eintrag label={t.detailProvider} wert={detail.provider_id ?? common.none} mono />
            {detail.related_type && (
              <Eintrag label={t.detailRelated} wert={`${detail.related_type} · ${detail.related_id ?? common.none}`} mono />
            )}
            {detail.resend_of !== null && (
              <Eintrag label={t.detailResendOf} wert={`#${detail.resend_of}`} />
            )}
            {detail.error && <Eintrag label={t.detailError} wert={detail.error} />}
            <dt className="ct-label col-span-2 mt-4 text-muted">{t.detailVars}</dt>
            <dd className="col-span-2">
              {Object.keys(detail.vars).length === 0 ? (
                <p className="ct-help text-muted">{t.detailNoVars}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {Object.entries(detail.vars).map(([k, v]) => (
                    <li key={k} className="ct-help">
                      <span className="font-mono text-muted">{k}</span>{" "}
                      {typeof v === "string" ? v : JSON.stringify(v)}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </dl>
        )}
      </Drawer>

      {frage && (
        <ConfirmDialog
          title={t.resendConfirmTitle}
          body={t.resendConfirmBody.replace("{to}", frage.to_email)}
          confirmLabel={t.resend}
          cancelLabel={common.cancel}
          pending={pending}
          onConfirm={() => erneut(frage)}
          onCancel={() => setFrage(null)}
        />
      )}
    </>
  );
}

function Eintrag({ label, wert, mono }: { label: string; wert: string; mono?: boolean }) {
  return (
    <>
      <dt className="ct-label text-muted">{label}</dt>
      <dd className={mono ? "ct-help font-mono break-all" : "break-words"}>{wert}</dd>
    </>
  );
}
