"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { cancelCompanion, requestCompanion } from "./actions";
import type { SpeakerTickets } from "./types";

type Strings = Record<string, string>;

const STATUS_TONE: Record<string, BadgeTone> = {
  requested: "accent",
  approved: "accent",
  valid: "success",
  cancelled: "neutral",
};

export function TicketsView({
  profileId,
  isAssistant,
  tickets,
  passTypes,
  pipelineLabels,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  profileId: string;
  isAssistant: boolean;
  tickets: SpeakerTickets;
  passTypes: Record<string, string>;
  pipelineLabels: Record<string, string>;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [askCancel, setAskCancel] = useState(false);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const own = tickets.own;
  const companion = tickets.companion;

  function onRequest() {
    startTransition(async () => {
      const res = await requestCompanion(profileId, email, first, last);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      setEmail("");
      setFirst("");
      setLast("");
      toast("success", t.companionRequested);
      router.refresh();
    });
  }

  function onCancel() {
    if (!companion) return;
    startTransition(async () => {
      setAskCancel(false);
      const res = await cancelCompanion(companion.id);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", t.companionCancelled);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Eigenes Ticket */}
      <Card className="p-6">
        <h2 className="ct-h3 mb-3 text-ink">{t.ownTicket}</h2>

        {!tickets.eligible ? (
          <>
            <p className="ct-help">{t.ticketAfterConfirmation}</p>
            <p className="ct-help mt-1">
              {t.statusPipeline}: {pipelineLabels[tickets.pipeline_status] ?? tickets.pipeline_status}
            </p>
          </>
        ) : !own ? (
          <p className="ct-help">{t.ticketBeingIssued}</p>
        ) : !own.issued ? (
          <>
            <Badge tone={STATUS_TONE[own.status] ?? "neutral"}>
              {t[`ticket_${own.status}`] ?? own.status}
            </Badge>
            <p className="ct-help mt-3">{t.ticketBeingIssued}</p>
          </>
        ) : !own.barcode ? (
          // Ausgestellt, aber ohne Barcode: das ist die Assistenz. Die RPC
          // gibt ihn nicht heraus, also gibt es hier auch nichts zu zeigen.
          <>
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">{t.ticket_valid}</Badge>
              {own.pass_type && <Badge>{passTypes[own.pass_type] ?? own.pass_type}</Badge>}
              {own.lounge_access && <Badge tone="accent">{t.loungeBadge}</Badge>}
            </div>
            <p className="ct-label mt-3 text-ink">
              {[own.holder_first_name, own.holder_last_name].filter(Boolean).join(" ") ||
                common.none}
            </p>
            <p className="ct-help mt-2">{t.qrSpeakerOnly}</p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-6">
              <QrCode value={own.barcode} label={t.qrAlt} />
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="success">{t.ticket_valid}</Badge>
                  {own.pass_type && (
                    <Badge>{passTypes[own.pass_type] ?? own.pass_type}</Badge>
                  )}
                  {own.lounge_access && <Badge tone="accent">{t.loungeBadge}</Badge>}
                </div>
                <p className="ct-label mt-3 text-ink">
                  {[own.holder_first_name, own.holder_last_name].filter(Boolean).join(" ") ||
                    common.none}
                </p>
                {(own.holder_position || own.holder_company) && (
                  <p className="ct-help">
                    {[own.holder_position, own.holder_company].filter(Boolean).join(" · ")}
                  </p>
                )}
                {own.lounge_access && <p className="ct-help mt-2">{t.loungeHint}</p>}
                {own.checked_in_at && (
                  <p className="ct-help mt-2">
                    {t.checkedIn}: {dateTime.format(new Date(own.checked_in_at))}
                  </p>
                )}
              </div>
            </div>
            <p className="ct-help mt-4">{t.qrHint}</p>
          </>
        )}
      </Card>

      {/* Begleitticket */}
      <Card className="p-6">
        <h2 className="ct-h3 mb-1 text-ink">{t.companionTitle}</h2>
        <p className="ct-help mb-4">{t.companionLead}</p>

        {!tickets.eligible ? (
          <p className="ct-help">{t.companionAfterConfirmation}</p>
        ) : companion ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[companion.status] ?? "neutral"}>
                  {t[`companion_${companion.status}`] ?? companion.status}
                </Badge>
                {companion.pass_type && (
                  <Badge>{passTypes[companion.pass_type] ?? companion.pass_type}</Badge>
                )}
              </div>
              <p className="ct-label mt-2 text-ink">
                {[companion.first_name, companion.last_name].filter(Boolean).join(" ") ||
                  common.none}
              </p>
              {companion.email && <p className="ct-help">{companion.email}</p>}
              <p className="ct-help mt-2">
                {companion.status === "requested" && t.companionRequestedHint}
                {companion.status === "approved" &&
                  t.companionApprovedHint.replace("{email}", companion.email ?? "")}
                {companion.issued && t.companionIssuedHint}
              </p>
              {companion.team_note && (
                <p className="ct-help mt-1">
                  {t.teamNote}: {companion.team_note}
                </p>
              )}
            </div>
            {/* Ausgestelltes zieht man nicht mehr selbst zurück — die RPC
                antwortet dann `already_issued`, das sagen wir vorher. */}
            {companion.issued ? (
              <p className="ct-help max-w-[260px]">{t.companionIssuedContact}</p>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setAskCancel(true)}
              >
                {t.companionWithdraw}
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.companionFirstName} htmlFor="c_first">
                <Input id="c_first" value={first} onChange={(e) => setFirst(e.target.value)} />
              </Field>
              <Field label={t.companionLastName} htmlFor="c_last">
                <Input id="c_last" value={last} onChange={(e) => setLast(e.target.value)} />
              </Field>
              <Field label={t.companionEmail} htmlFor="c_email" hint={t.companionEmailHint}>
                <Input
                  id="c_email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Button
                disabled={pending || email.trim() === "" || first.trim() === ""}
                onClick={onRequest}
              >
                {t.companionRequest}
              </Button>
            </div>
          </>
        )}

        {tickets.companion_history.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <h3 className="ct-label mb-2 text-ink">{t.companionHistory}</h3>
            <ul className="flex flex-col gap-2">
              {tickets.companion_history.map((h) => (
                <li key={h.id} className="ct-help">
                  {[h.first_name, h.last_name].filter(Boolean).join(" ") || common.none} ·{" "}
                  {t.companion_cancelled} · {dateTime.format(new Date(h.created_at))}
                  {h.team_note && ` · ${h.team_note}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {askCancel && (
        <ConfirmDialog
          title={t.companionWithdrawTitle}
          body={t.companionWithdrawBody}
          confirmLabel={t.companionWithdraw}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskCancel(false)}
          onConfirm={onCancel}
        />
      )}

      {isAssistant && <p className="ct-help">{t.companionAssistantNote}</p>}
    </div>
  );
}

/**
 * QR-Code aus dem Barcode. Gezeichnet wird im Browser auf ein Canvas — der
 * Wert geht damit weder durch eine URL noch durch ein Server-Log.
 */
function QrCode({ value, label }: { value: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, value, { width: 220, margin: 1 }).catch(() => setFailed(true));
  }, [value]);

  if (failed) {
    return <p className="ct-help">{label}</p>;
  }
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className="rounded-ct-md border bg-white p-2"
    />
  );
}
