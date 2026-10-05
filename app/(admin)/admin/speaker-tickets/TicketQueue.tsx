"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { confirmCompanion, declineCompanion } from "../actions";
import { cancelCompanionTicket, issueSpeakerTicket, setCompanionLounge, setSpeakerLounge } from "./actions";

type Strings = Record<string, string>;

export type AdminTicket = {
  id: string;
  profile_id: string;
  speaker_name: string | null;
  source: string;
  status: string;
  pass_type: string | null;
  lounge_access: boolean;
  holder_first_name: string | null;
  holder_last_name: string | null;
  holder_email: string | null;
  issued: boolean;
  vivenu_ticket_id: string | null;
  requested_at: string;
  approved_at: string | null;
  team_note: string | null;
};

const TONE: Record<string, BadgeTone> = {
  requested: "accent",
  approved: "accent",
  valid: "success",
  cancelled: "neutral",
};

export function TicketQueue({
  tickets,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  tickets: AdminTicket[];
  dateLocale: string;
  t: Strings;
  common: { cancel: string; none: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [askCancel, setAskCancel] = useState<AdminTicket | null>(null);

  const message = (key: string, detail?: string) =>
    (rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : "");
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "short" });
  const note = (id: string) => notes[id] ?? "";
  const nameOf = (x: AdminTicket) =>
    [x.holder_first_name, x.holder_last_name].filter(Boolean).join(" ") || x.speaker_name || common.none;

  /**
   * Ausstellen (SPK-068): legt das Freiticket bei vivenu an und traegt Barcode
   * und Secret ein. Der Lauf ist idempotent — war das Ticket drueben schon da,
   * meldet die Oberflaeche das ausdruecklich, statt einen Erfolg vorzutaeuschen.
   */
  function onIssue(id: string) {
    startTransition(async () => {
      const res = await issueSpeakerTicket(id);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", res.bereitsVorhanden ? t.issueAlready : t.issued);
      router.refresh();
    });
  }

  function run(fn: Promise<{ ok: boolean; key?: string }>, okText: string) {
    startTransition(async () => {
      const res = (await fn) as { ok: boolean; key?: string };
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown"));
        return;
      }
      toast("success", okText);
      router.refresh();
    });
  }

  /**
   * Lounge je Ticket (ADM-076) — **ein Schalter, der den richtigen Weg nimmt** (Plan 05.10.): am eigenen Ticket gilt das
   * Profil-Flag (`setSpeakerLounge`, der Abgleich zieht es an das Ticket nach), an der Begleitung das Ticket selbst
   * (`setCompanionLounge`). Eine Quelle je Ticketart; sonst überschriebe der Abgleich, was am Ticket gesetzt wurde.
   */
  function onLounge(x: AdminTicket, an: boolean) {
    startTransition(async () => {
      const res =
        x.source === "speaker_companion" ? await setCompanionLounge(x.id, an) : await setSpeakerLounge(x.profile_id, an);
      if (!res.ok) {
        toast("error", message(res.key, res.detail));
        return;
      }
      toast("success", t.loungeSaved);
      router.refresh();
    });
  }

  function onCancel(x: AdminTicket) {
    startTransition(async () => {
      setAskCancel(null);
      const res = await cancelCompanionTicket(x.id);
      if (!res.ok) {
        toast("error", message(res.key, res.detail));
        return;
      }
      toast("success", t.cancelled);
      router.refresh();
    });
  }

  return (
    <>
      <Table stapeln>
        <Thead>
          <Th>{t.colSpeaker}</Th>
          <Th>{t.colKind}</Th>
          <Th>{t.colHolder}</Th>
          <Th>{t.colStatus}</Th>
          <Th>{t.colLounge}</Th>
          <Th>{t.colNote}</Th>
          <Th aria-label={t.colAction} />
        </Thead>
        <Tbody>
          {tickets.map((x) => (
            <Tr key={x.id}>
              <Td>{x.speaker_name || common.none}</Td>
              <Td label={t.colKind} className="text-muted">
                {x.source === "speaker_companion" ? t.kindCompanion : t.kindSpeaker}
              </Td>
              <Td label={t.colHolder}>
                {[x.holder_first_name, x.holder_last_name].filter(Boolean).join(" ") || common.none}
                {x.holder_email && <div className="ct-help">{x.holder_email}</div>}
              </Td>
              <Td label={t.colStatus}>
                <Badge tone={TONE[x.status] ?? "neutral"}>{t[`status_${x.status}`] ?? x.status}</Badge>
                <div className="ct-help">
                  {dateTime.format(new Date(x.requested_at))}
                  {x.issued && ` · ${t.issued}`}
                  {/* Die vivenu-Kennung gehoert sichtbar dazu: ohne sie laesst
                      sich drueben nichts nachschlagen, wenn etwas klemmt. */}
                  {x.vivenu_ticket_id && <div className="font-mono">{x.vivenu_ticket_id}</div>}
                </div>
              </Td>
              <Td label={t.colLounge}>
                {x.status === "cancelled" ? (
                  <span className="ct-help">{common.none}</span>
                ) : (
                  <Checkbox
                    aria-label={t.loungeFor.replace("{name}", nameOf(x))}
                    checked={x.lounge_access}
                    disabled={pending}
                    onChange={(e) => onLounge(x, e.target.checked)}
                  />
                )}
              </Td>
              <Td label={t.colNote}>
                {/* Nur dort ein Feld, wo eine Anmerkung noch etwas bewirkt. */}
                {x.source === "speaker_companion" && x.status === "requested" ? (
                  <Input
                    aria-label={t.colNote}
                    value={note(x.id)}
                    onChange={(e) => setNotes((n) => ({ ...n, [x.id]: e.target.value }))}
                  />
                ) : (
                  <span className="ct-help">{x.team_note || common.none}</span>
                )}
              </Td>
              <Td>
                {/* Ausstellen: Speaker-Pass sobald angefragt, Begleitticket erst
                    nach der Freigabe — dieselben Regeln wie `set_ticket_issued`. */}
                {!x.issued &&
                  ((x.source === "speaker" && x.status === "requested") ||
                    (x.source === "speaker_companion" && x.status === "approved")) && (
                    <Button size="sm" disabled={pending} onClick={() => onIssue(x.id)}>
                      {t.issue}
                    </Button>
                  )}
                {x.source === "speaker_companion" && x.status === "requested" && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => run(confirmCompanion(x.id, note(x.id)), t.confirmed)}
                    >
                      {t.confirm}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending || note(x.id).trim() === ""}
                      onClick={() => run(declineCompanion(x.id, note(x.id)), t.declined)}
                    >
                      {t.decline}
                    </Button>
                  </div>
                )}
                {/* Stornieren (ADM-076): was **noch nicht ausgestellt** ist. Ausgestellte storniert das Team bei vivenu —
                    ein nur hier stornierter Barcode bliebe am Einlass gültig —, und der Abgleich zieht den Stand nach. */}
                {x.source === "speaker_companion" && x.status === "approved" && !x.issued && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAskCancel(x)}>
                    {t.cancelTicket}
                  </Button>
                )}
                {x.issued && x.status !== "cancelled" && <p className="ct-help max-w-65">{t.cancelAtVivenu}</p>}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      {askCancel && (
        <ConfirmDialog
          title={t.cancelTitle}
          body={t.cancelBody}
          detail={
            <p className="ct-label">
              {nameOf(askCancel)}
              {askCancel.speaker_name ? ` · ${askCancel.speaker_name}` : ""}
            </p>
          }
          confirmLabel={t.cancelTicket}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskCancel(null)}
          onConfirm={() => onCancel(askCancel)}
        />
      )}
    </>
  );
}
