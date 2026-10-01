"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import type { HackChallenge } from "@/app/(hackathon)/hackathon/types";
import { setChallengeTrack } from "./actions";

type Strings = Record<string, string>;

/**
 * Freigegebene Challenges mit ihrem Track (HACK-008). Der Track wird beim
 * Freigeben gesetzt; hier lässt er sich ändern — die Auswahl speichert sofort,
 * weil es je Zeile genau einen Wert gibt.
 */
export function ChallengeTracks({
  rows,
  trackLabels,
  t,
  rpcMessages,
}: {
  rows: HackChallenge[];
  trackLabels: Record<string, string>;
  t: Strings;
  rpcMessages: Strings;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  if (rows.length === 0) return <EmptyState title={t.tracksEmpty} description={t.tracksLead} />;

  const options = Object.entries(trackLabels).map(([value, label]) => ({ value, label }));
  const speichern = (id: string, track: string) =>
    start(async () => {
      const res = await setChallengeTrack(id, track);
      if (!res.ok) toast("error", rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key);
      else {
        toast("success", t.trackSaved);
        router.refresh();
      }
    });

  return (
    <div className="overflow-x-auto">
      <Table>
        <Thead>
          <Tr>
            <Th>{t.challengeColumn}</Th>
            <Th>{t.trackColumn}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((c) => (
            <Tr key={c.id} controls>
              <Td>
                <span className="ct-label">{c.title}</span>
                {c.org_name && <span className="ct-help block">{c.org_name}</span>}
              </Td>
              <Td>
                <Select
                  aria-label={`${t.trackColumn}: ${c.title}`}
                  className="w-auto"
                  value={c.track ?? ""}
                  placeholder={c.track ? undefined : "—"}
                  options={options}
                  disabled={pending}
                  onChange={(e) => e.target.value && speichern(c.id, e.target.value)}
                />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}
