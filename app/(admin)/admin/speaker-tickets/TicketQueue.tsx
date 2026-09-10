"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { confirmCompanion, declineCompanion } from "../actions";

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

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "short" });
  const note = (id: string) => notes[id] ?? "";

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

  return (
    <Table>
      <Thead>
        <Th>{t.colSpeaker}</Th>
        <Th>{t.colKind}</Th>
        <Th>{t.colHolder}</Th>
        <Th>{t.colStatus}</Th>
        <Th>{t.colNote}</Th>
        <Th aria-label={t.colAction} />
      </Thead>
      <Tbody>
        {tickets.map((x) => (
          <Tr key={x.id}>
            <Td>{x.speaker_name || common.none}</Td>
            <Td className="text-muted">
              {x.source === "speaker_companion" ? t.kindCompanion : t.kindSpeaker}
              {x.lounge_access && ` · ${t.lounge}`}
            </Td>
            <Td>
              {[x.holder_first_name, x.holder_last_name].filter(Boolean).join(" ") ||
                common.none}
              {x.holder_email && <div className="ct-help">{x.holder_email}</div>}
            </Td>
            <Td>
              <Badge tone={TONE[x.status] ?? "neutral"}>
                {t[`status_${x.status}`] ?? x.status}
              </Badge>
              <div className="ct-help">
                {dateTime.format(new Date(x.requested_at))}
                {x.issued && ` · ${t.issued}`}
              </div>
            </Td>
            <Td>
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
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
