"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Leaderboard } from "@/app/(hackathon)/hackathon/Leaderboard";
import type { LeaderboardRow } from "@/app/(hackathon)/hackathon/types";
import { confirmMetric } from "./actions";

type Strings = Record<string, string>;

/**
 * Metrik-Werte einer Challenge bestätigen (HACK-009). Eingetragen haben sie
 * Team oder Partner-Jury; erst bestätigt bekommen sie einen Rang. Die Liste
 * zeigt dem Hack-Team auch unbestätigte Werte (Regel in `hack_leaderboard`).
 */
export function MetricResults({
  title,
  metricLabel,
  rows,
  locale,
  t,
  th,
  rpcMessages,
}: {
  title: string;
  metricLabel: string;
  rows: LeaderboardRow[];
  locale: string;
  /** Texte des Admin-Abschnitts. */
  t: Strings;
  /** Texte der Teilnehmer-App (Leaderboard-Spalten). */
  th: Strings;
  rpcMessages: Strings;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const umschalten = (teamId: string, confirm: boolean) =>
    start(async () => {
      const res = await confirmMetric(teamId, confirm);
      if (!res.ok) toast("error", rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key);
      else {
        toast("success", confirm ? t.metricConfirmedToast : t.metricUnconfirmedToast);
        router.refresh();
      }
    });

  return (
    <section className="flex flex-col gap-2">
      <h3 className="ct-h3">{title}</h3>
      <Leaderboard
        rows={rows}
        metricLabel={metricLabel}
        locale={locale}
        t={th}
        actions={(r) =>
          r.confirmed ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => umschalten(r.team_id, false)}>
              {t.metricUnconfirm}
            </Button>
          ) : (
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => umschalten(r.team_id, true)}>
              {t.metricConfirm}
            </Button>
          )
        }
      />
    </section>
  );
}
