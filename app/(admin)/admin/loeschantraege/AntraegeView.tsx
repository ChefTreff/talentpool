"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { resolveRequest } from "./actions";

type Strings = Record<string, string>;

/** Zeile aus `deletion_requests_admin()` (Migration 0115). */
export type Antrag = {
  id: string;
  person_id: string;
  person_name: string | null;
  email: string | null;
  reason: string | null;
  blockers: string[];
  status: string;
  requested_at: string;
  handled_by_name: string | null;
  handled_at: string | null;
  handled_note: string | null;
};

const TONES: Record<string, BadgeTone> = {
  pending: "warning",
  done: "neutral",
  rejected: "neutral",
};

/**
 * Löschanträge auflösen.
 *
 * Zwei Wege, und beide sind endgültig genug, um eine Rückfrage zu verdienen:
 * **Löschen** anonymisiert sofort, **Ablehnen** schickt die Begründung als Mail
 * an die Person. Deshalb ist die Begründung beim Ablehnen Pflicht — ein „nein"
 * ohne Satz wäre keine Antwort, sondern nur ein geschlossener Vorgang.
 */
export function AntraegeView({
  antraege,
  status,
  dateLocale,
  t,
  blockerLabels,
  common,
  rpcMessages,
}: {
  antraege: Antrag[];
  status: string;
  dateLocale: string;
  t: Strings;
  blockerLabels: Record<string, string>;
  common: { cancel: string; none: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const pfad = usePathname();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [notiz, setNotiz] = useState<Record<string, string>>({});
  const [frage, setFrage] = useState<{ a: Antrag; aktion: "delete" | "reject" } | null>(null);

  const zeit = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" });
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  function aufloesen(a: Antrag, aktion: "delete" | "reject") {
    start(async () => {
      const res = await resolveRequest(a.id, aktion, notiz[a.id] ?? "");
      setFrage(null);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", aktion === "delete" ? t.resolvedDeleted : t.resolvedRejected);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4 max-w-[260px]">
        <Field label={t.filterStatus} htmlFor="f-status">
          <Select
            id="f-status"
            options={[
              { value: "pending", label: t.statusPending },
              { value: "done", label: t.statusDone },
              { value: "rejected", label: t.statusRejected },
              { value: "all", label: t.statusAll },
            ]}
            value={status}
            onChange={(e) => router.push(`${pfad}?status=${e.target.value}`)}
          />
        </Field>
      </div>

      {antraege.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <div className="flex flex-col gap-4">
          {antraege.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="ct-label">{a.person_name ?? common.none}</p>
                  <p className="ct-help text-muted">{a.email ?? common.none}</p>
                </div>
                <Badge tone={TONES[a.status] ?? "neutral"}>
                  {a.status === "pending" ? t.statusPending : a.status === "done" ? t.statusDone : t.statusRejected}
                </Badge>
              </div>

              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <dt className="ct-label text-muted">{t.colRequested}</dt>
                <dd>{zeit.format(new Date(a.requested_at))}</dd>
                <dt className="ct-label text-muted">{t.colBlockers}</dt>
                <dd>
                  {a.blockers.length === 0
                    ? common.none
                    : a.blockers.map((b) => blockerLabels[b] ?? b).join(" · ")}
                </dd>
                {a.reason && (
                  <>
                    <dt className="ct-label text-muted">{t.colReason}</dt>
                    <dd className="break-words">{a.reason}</dd>
                  </>
                )}
                {a.handled_at && (
                  <>
                    <dt className="ct-label text-muted">{t.colHandled}</dt>
                    <dd>
                      {zeit.format(new Date(a.handled_at))}
                      {a.handled_by_name && ` · ${a.handled_by_name}`}
                      {a.handled_note && (
                        <div className="ct-help text-muted">{a.handled_note}</div>
                      )}
                    </dd>
                  </>
                )}
              </dl>

              {a.status === "pending" && (
                <div className="mt-4 border-t pt-4">
                  <Field label={t.fieldNote} htmlFor={`n-${a.id}`} hint={t.fieldNoteHint}>
                    <Textarea
                      id={`n-${a.id}`}
                      rows={2}
                      maxLength={500}
                      value={notiz[a.id] ?? ""}
                      onChange={(e) => setNotiz({ ...notiz, [a.id]: e.target.value })}
                    />
                  </Field>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="destructive"
                      disabled={pending}
                      onClick={() => setFrage({ a, aktion: "delete" })}
                    >
                      {t.actionDelete}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={pending || (notiz[a.id] ?? "").trim() === ""}
                      onClick={() => setFrage({ a, aktion: "reject" })}
                    >
                      {t.actionReject}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {frage && (
        <ConfirmDialog
          title={frage.aktion === "delete" ? t.confirmDeleteTitle : t.confirmRejectTitle}
          body={(frage.aktion === "delete" ? t.confirmDeleteBody : t.confirmRejectBody).replace(
            "{name}",
            frage.a.person_name ?? frage.a.email ?? common.none,
          )}
          confirmLabel={frage.aktion === "delete" ? t.actionDelete : t.actionReject}
          cancelLabel={common.cancel}
          pending={pending}
          onConfirm={() => aufloesen(frage.a, frage.aktion)}
          onCancel={() => setFrage(null)}
        />
      )}
    </>
  );
}
