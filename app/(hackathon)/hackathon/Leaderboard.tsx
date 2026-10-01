import { Badge } from "@/components/ui/Badge";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import type { LeaderboardRow } from "./types";

type Strings = Record<string, string>;

/**
 * Leaderboard einer Metrik-Challenge (HACK-009). Welche Zeilen jemand sieht,
 * entscheidet `hack_leaderboard`: alle die bestätigten, das eigene Team auch
 * den eigenen unbestätigten Wert. Ohne Werte steht ein Satz statt einer leeren
 * Tabelle.
 */
export function Leaderboard({
  rows,
  metricLabel,
  locale,
  t,
  actions,
}: {
  rows: LeaderboardRow[];
  metricLabel: string;
  locale: string;
  t: Strings;
  /** Optionale Bedienspalte (Admin: Bestätigen). */
  actions?: (row: LeaderboardRow) => React.ReactNode;
}) {
  if (rows.length === 0) return <p className="ct-help">{t.leaderboardEmpty}</p>;
  const zahl = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });
  return (
    <div className="overflow-x-auto">
      <Table>
        <Thead>
          <Tr>
            <Th>{t.leaderboardRank}</Th>
            <Th>{t.leaderboardTeam}</Th>
            <Th>{metricLabel}</Th>
            {actions && <Th>{""}</Th>}
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((r) => (
            <Tr key={r.team_id} controls={Boolean(actions)}>
              <Td>{r.rank ?? "—"}</Td>
              <Td>
                <span className={r.is_mine ? "ct-label" : undefined}>{r.team_name}</span>
                {r.is_mine && <span className="ct-help"> · {t.leaderboardMine}</span>}
              </Td>
              <Td>
                <span className="tabular-nums">{zahl.format(r.value)}</span>
                {!r.confirmed && (
                  <Badge tone="warning" className="ml-2">
                    {t.metricPending}
                  </Badge>
                )}
              </Td>
              {actions && <Td>{actions(r)}</Td>}
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}
