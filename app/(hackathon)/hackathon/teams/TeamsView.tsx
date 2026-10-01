"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { assignChallenges, publishChallenge } from "../actions";
import type { HackOpenChallenge, HackTeamRow } from "../types";

type Strings = Record<string, string>;

/**
 * Die Sicht des Hack-Teams: wer ist im Rennen, welche Challenge, was kam an.
 *
 * „Assign challenges" verteilt gleichmässig auf alle Teams **ohne** Challenge
 * und fasst gesetzte Zuordnungen nicht an — ein zweiter Klick ändert also
 * nichts an dem, was jemand von Hand gesetzt hat.
 */
export function TeamsView({
  rows,
  openChallenges,
  trackLabels,
  locale,
  t,
  rpcMessages,
}: {
  rows: HackTeamRow[];
  /** Eingereichte, aber noch nicht freigegebene Challenge-Formulare der Partner. */
  openChallenges: HackOpenChallenge[];
  /** vocab hack_track: Schlüssel → Bezeichnung (HACK-008). */
  trackLabels: Record<string, string>;
  locale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  // Track je offenem Formular: vorbelegt aus der Antwort des Partners (HACK-008).
  const [tracks, setTracks] = useState<Record<string, string>>(() =>
    Object.fromEntries(openChallenges.map((c) => [c.deliverable_id, c.track ?? ""])),
  );
  const trackOptions = Object.entries(trackLabels).map(([value, label]) => ({ value, label }));
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });

  function run(action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) {
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown") + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", okText);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {openChallenges.length > 0 && (
        <section className="rounded-ct-lg border bg-surface p-4">
          <h2 className="ct-h3">{t.challengesTitle}</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {openChallenges.map((c) => (
              <li key={c.deliverable_id} className="flex flex-wrap items-center gap-3">
                <span className="ct-label">{c.title ?? "—"}</span>
                <span className="ct-help">{c.org_name}</span>
                <Select
                  aria-label={t.track}
                  className="w-auto"
                  value={tracks[c.deliverable_id] ?? ""}
                  placeholder={t.trackChoose}
                  options={trackOptions}
                  onChange={(e) => setTracks((prev) => ({ ...prev, [c.deliverable_id]: e.target.value }))}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending || !tracks[c.deliverable_id]}
                  onClick={() =>
                    run(publishChallenge(c.deliverable_id, tracks[c.deliverable_id]), t.challengePublished)
                  }
                >
                  {t.publishChallenge}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await assignChallenges();
              if (!res.ok) {
                toast("error", message(res.key ?? "unknown"));
                return;
              }
              toast("success", t.assigned.replace("{n}", String(res.data.teams)));
              router.refresh();
            })
          }
        >
          {t.assign}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t.teamsEmpty} description={t.teamsEmptyBody} />
      ) : (
        <Table>
          <Thead>
            <Th>{t.colTeam}</Th>
            <Th numeric>{t.colMembers}</Th>
            <Th>{t.colCaptain}</Th>
            <Th>{t.colChallenge}</Th>
            <Th>{t.colSubmitted}</Th>
            <Th numeric>{t.colScores}</Th>
            <Th numeric>{t.colAverage}</Th>
          </Thead>
          <Tbody>
            {rows.map((r) => (
              <Tr key={r.team_id}>
                <Td>
                  <span className="ct-label">{r.team_name}</span>
                  {r.members < 3 && (
                    <div className="ct-help text-warning-ink">{t.tooSmall}</div>
                  )}
                </Td>
                <Td numeric className="tabular-nums">{r.members}</Td>
                <Td className="text-muted">{r.captain ?? "—"}</Td>
                <Td className="text-muted">
                  {r.challenge_title ?? <Badge tone="warning">{t.challengeNone}</Badge>}
                </Td>
                <Td className="text-muted tabular-nums">
                  {r.submitted_at ? date.format(new Date(r.submitted_at)) : "—"}
                  {r.late && (
                    <Badge tone="warning" className="ml-2">
                      {t.late}
                    </Badge>
                  )}
                </Td>
                <Td numeric className="tabular-nums">{r.scores}</Td>
                <Td numeric className="tabular-nums">{r.avg_total?.toFixed(2) ?? "—"}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
