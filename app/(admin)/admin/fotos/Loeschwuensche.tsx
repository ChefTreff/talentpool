"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { handleRemoval } from "./actions";

type Strings = Record<string, string>;

export type Loeschwunsch = {
  request_id: string;
  event_name: string;
  filename: string;
  first_name: string | null;
  last_name: string | null;
  note: string | null;
  status: "open" | "done" | "rejected";
};

/** Löschwünsche von Teilnehmenden (TAL-010). „Erledigt“ heißt: das Foto ist gelöscht oder zurückgezogen. */
export function Loeschwuensche({ rows, t }: { rows: Loeschwunsch[]; t: Strings }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  if (rows.length === 0) return <p className="ct-help">{t.removalNone}</p>;
  const setzen = (id: string, status: "done" | "rejected") =>
    start(async () => {
      const res = await handleRemoval(id, status);
      if (!res.ok) toast("error", t.failed);
      else {
        toast("success", t.removalHandled);
        router.refresh();
      }
    });
  return (
    <div className="overflow-x-auto">
      <Table>
        <Thead>
          <Tr>
            <Th>{t.colEvent}</Th>
            <Th>{t.colPhoto}</Th>
            <Th>{t.colPerson}</Th>
            <Th>{t.colNote}</Th>
            <Th>{""}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((r) => (
            <Tr key={r.request_id} controls>
              <Td>{r.event_name}</Td>
              <Td>{r.filename}</Td>
              <Td>{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</Td>
              <Td><span className="ct-small block max-w-xs whitespace-pre-line">{r.note ?? "—"}</span></Td>
              <Td>
                {r.status === "open" ? (
                  <span className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => setzen(r.request_id, "done")}>{t.removalDone}</Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setzen(r.request_id, "rejected")}>{t.removalReject}</Button>
                  </span>
                ) : (
                  <Badge tone="neutral">{r.status === "done" ? t.removalDone : t.removalReject}</Badge>
                )}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}
