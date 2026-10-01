"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import type { HackChallenge } from "@/app/(hackathon)/hackathon/types";
import { setChallengeDeadline, setChallengeJudging, setChallengeTrack } from "./actions";

type Strings = Record<string, string>;

/**
 * Freigegebene Challenges mit ihrem Track (HACK-008). Der Track wird beim
 * Freigeben gesetzt; hier lässt er sich ändern — die Auswahl speichert sofort,
 * weil es je Zeile genau einen Wert gibt.
 *
 * HACK-009: daneben die Auswertungsart (Jury oder Metrik mit Bezeichnung und
 * Richtung). Drei Werte gehören zusammen, darum hier ein Speichern-Knopf.
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
            <Th>{t.judgingColumn}</Th>
            <Th>{t.deadlineColumn}</Th>
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
              <Td>
                <JudgingCell challenge={c} t={t} rpcMessages={rpcMessages} />
              </Td>
              <Td>
                <DeadlineCell challenge={c} t={t} rpcMessages={rpcMessages} />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}

function JudgingCell({ challenge, t, rpcMessages }: { challenge: HackChallenge; t: Strings; rpcMessages: Strings }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"jury" | "metric">(challenge.judging_mode ?? "jury");
  const [label, setLabel] = useState(challenge.metric_label ?? "");
  const [higher, setHigher] = useState(challenge.metric_higher_better ?? true);
  const geaendert =
    mode !== (challenge.judging_mode ?? "jury") ||
    (mode === "metric" && (label !== (challenge.metric_label ?? "") || higher !== (challenge.metric_higher_better ?? true)));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label={`${t.judgingColumn}: ${challenge.title}`}
        className="w-auto"
        value={mode}
        options={[
          { value: "jury", label: t.judgingJury },
          { value: "metric", label: t.judgingMetricOption },
        ]}
        disabled={pending}
        onChange={(e) => setMode(e.target.value as "jury" | "metric")}
      />
      {mode === "metric" && (
        <>
          <Input
            aria-label={t.metricLabel}
            placeholder={t.metricLabel}
            className="w-48"
            maxLength={80}
            value={label}
            disabled={pending}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Select
            aria-label={t.metricDirection}
            className="w-auto"
            value={higher ? "higher" : "lower"}
            options={[
              { value: "higher", label: t.metricHigher },
              { value: "lower", label: t.metricLower },
            ]}
            disabled={pending}
            onChange={(e) => setHigher(e.target.value === "higher")}
          />
        </>
      )}
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || !geaendert || (mode === "metric" && label.trim() === "")}
        onClick={() =>
          start(async () => {
            const res = await setChallengeJudging({ challengeId: challenge.id, mode, metricLabel: label.trim(), higherBetter: higher });
            if (!res.ok) toast("error", rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key);
            else {
              toast("success", t.judgingSaved);
              router.refresh();
            }
          })
        }
      >
        {t.judgingSave}
      </Button>
    </div>
  );
}

/** ISO-Zeitpunkt → Wert für `datetime-local` in der Zeitzone des Browsers. */
function lokal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

/**
 * Abgabefrist je Challenge (HACK-011). Danach geht die Abgabe weiter, wird aber
 * als „verspätet“ markiert — die Prüfung macht die Datenbank beim Einreichen.
 */
function DeadlineCell({ challenge, t, rpcMessages }: { challenge: HackChallenge; t: Strings; rpcMessages: Strings }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [wert, setWert] = useState(lokal(challenge.submission_deadline));
  const geaendert = wert !== lokal(challenge.submission_deadline);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="datetime-local"
        aria-label={`${t.deadlineColumn}: ${challenge.title}`}
        className="w-auto"
        value={wert}
        disabled={pending}
        onChange={(e) => setWert(e.target.value)}
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || !geaendert}
        onClick={() =>
          start(async () => {
            const res = await setChallengeDeadline(challenge.id, wert ? new Date(wert).toISOString() : null);
            if (!res.ok) toast("error", rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key);
            else {
              toast("success", t.deadlineSaved);
              router.refresh();
            }
          })
        }
      >
        {t.judgingSave}
      </Button>
    </div>
  );
}
