import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { ZUSTAND_TON, zaehle, type PersonenStand } from "@/lib/einwilligungen/stand";

type Strings = Record<string, string>;

/**
 * Eine Zeile je Person mit dem **aktuellen Stand je Art** (ADM-096). Die Chips
 * tragen den Zustand als Wort — Farbe allein ist nie die Information. Der Name
 * führt zur Personenseite, dort steht der Verlauf Zeile für Zeile.
 */
export function PersonenStandTabelle({
  zeilen,
  typen,
  dateLocale,
  t,
}: {
  zeilen: PersonenStand[];
  typen: Record<string, string>;
  dateLocale: string;
  t: Strings;
}) {
  const zeit = new Intl.DateTimeFormat(dateLocale, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });
  return (
    <Table stapeln>
      <Thead>
        <Th>{t.colPerson}</Th>
        <Th>{t.colCurrent}</Th>
        <Th>{t.colSummary}</Th>
        <Th>{t.colLastChange}</Th>
      </Thead>
      <Tbody>
        {zeilen.map((z) => {
          const n = zaehle(z.states);
          return (
            <Tr key={z.person_id}>
              <Td>
                <Link href={`/admin/personen/${z.person_id}#einwilligungen`} className="ct-link">
                  {z.person_name ?? z.email ?? t.noName}
                </Link>
                {z.person_name && z.email && <span className="ct-help block">{z.email}</span>}
              </Td>
              <Td label={t.colCurrent}>
                <span className="flex flex-wrap gap-1">
                  {z.states.map((s) => (
                    <Badge key={s.type} tone={ZUSTAND_TON[s.state]}>
                      {typen[s.type] ?? s.type}: {t[`state_${s.state}`]}
                    </Badge>
                  ))}
                </span>
              </Td>
              <Td label={t.colSummary} className="text-muted">
                {[
                  n.granted > 0 && `${n.granted} ${t.state_granted}`,
                  n.declined > 0 && `${n.declined} ${t.state_declined}`,
                  n.revoked > 0 && `${n.revoked} ${t.state_revoked}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Td>
              <Td label={t.colLastChange} className="text-muted tabular-nums">
                {zeit.format(new Date(z.last_change))}
              </Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
}
