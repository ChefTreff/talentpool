"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { saveScore } from "../actions";
import type { JudgingRow } from "../types";

type Strings = Record<string, string>;

/**
 * Eine Karte je Team: Einreichung lesen, Punkte je Kriterium vergeben,
 * speichern. **Die Gesamtnote rechnet die Datenbank** aus den Gewichten der
 * Challenge — die Ansicht zeigt nur, was zurückkommt. Sonst hätte am Ende jede
 * Jury-Ansicht ihre eigene Formel.
 */
export function JudgingView({
  rows,
  t,
  rpcMessages,
}: {
  rows: JudgingRow[];
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  if (rows.length === 0) {
    return <EmptyState title={t.judgingEmpty} description={t.judgingEmptyBody} />;
  }
  return (
    <div className="flex flex-col gap-6">
      {rows.map((r) => (
        <TeamCard key={r.team_id} row={r} t={t} rpcMessages={rpcMessages} />
      ))}
    </div>
  );
}

function TeamCard({
  row,
  t,
  rpcMessages,
}: {
  row: JudgingRow;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [scores, setScores] = useState<Record<string, string>>(
    Object.fromEntries((row.criteria ?? []).map((c) => [c.key, String(row.my_criteria?.[c.key] ?? "")])),
  );
  const [note, setNote] = useState(row.my_note ?? "");
  const [total, setTotal] = useState<number | null>(row.my_total);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  return (
    <Card>
      <CardHeader title={row.team_name} description={row.challenge_title ?? undefined} />
      <div className="flex flex-col gap-4">
        {row.submitted_at ? (
          <div className="flex flex-col gap-1">
            {row.submission_url && (
              <a className="ct-link" href={row.submission_url} target="_blank" rel="noopener noreferrer">
                {row.submission_url}
              </a>
            )}
            {row.repo_url && (
              <a className="ct-link" href={row.repo_url} target="_blank" rel="noopener noreferrer">
                {row.repo_url}
              </a>
            )}
            {row.notes && <p className="ct-help">{row.notes}</p>}
          </div>
        ) : (
          <p className="ct-help">{t.notSubmitted}</p>
        )}

        <div className="flex flex-wrap gap-4">
          {(row.criteria ?? []).map((c) => (
            <Field key={c.key} label={`${c.label} · ${c.weight} %`} htmlFor={`${row.team_id}-${c.key}`}>
              <Input
                id={`${row.team_id}-${c.key}`}
                type="number"
                min={0}
                max={10}
                className="w-24"
                value={scores[c.key] ?? ""}
                disabled={pending}
                onChange={(e) => setScores((s) => ({ ...s, [c.key]: e.target.value }))}
              />
            </Field>
          ))}
          {(row.criteria ?? []).length === 0 && <p className="ct-help">{t.challengeNone}</p>}
        </div>

        <Field label={t.noteToTeam} htmlFor={`${row.team_id}-note`}>
          <Textarea
            id={`${row.team_id}-note`}
            rows={2}
            value={note}
            disabled={pending}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={pending || (row.criteria ?? []).length === 0}
            onClick={() =>
              startTransition(async () => {
                const numeric = Object.fromEntries(
                  Object.entries(scores)
                    .filter(([, v]) => v.trim() !== "")
                    .map(([k, v]) => [k, Number(v)]),
                );
                const res = await saveScore({ teamId: row.team_id, criteria: numeric, note });
                if (!res.ok) {
                  toast("error", message(res.key ?? "unknown") + (res.detail ? ` (${res.detail})` : ""));
                  return;
                }
                setTotal(res.data.total);
                toast("success", t.scoreSaved);
                router.refresh();
              })
            }
          >
            {t.saveScore}
          </Button>
          {total != null && (
            <Badge tone="accent">
              {t.total}: {total.toFixed(2)}
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}
