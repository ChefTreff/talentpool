import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";

/** Eine Zeile aus `consent_records_admin` (ADM-033). */
export type Einwilligung = {
  id: string;
  person_id: string;
  person_name: string | null;
  email: string | null;
  consent_type: string;
  version: string;
  granted: boolean;
  granted_at: string;
  revoked_at: string | null;
  source: string;
  total: number;
};

type Strings = Record<string, string>;

export function zustand(e: Einwilligung): "revoked" | "granted" | "declined" {
  if (e.revoked_at) return "revoked";
  return e.granted ? "granted" : "declined";
}

const TON: Record<string, BadgeTone> = { granted: "success", declined: "neutral", revoked: "warning" };

/**
 * Die Tabelle steht zweimal: in der Liste der Verwaltung und als Geschichte auf
 * der Personenseite. Ohne Personenspalte, wenn sie für eine Person steht.
 *
 * Gezeigt wird **jede** Zeile, nicht der aktuelle Stand: der Nachweis ist die
 * Folge — wann wurde welcher Fassung zugestimmt, wann widerrufen.
 */
export function EinwilligungsTabelle({
  zeilen,
  typen,
  mitPerson,
  dateLocale,
  t,
}: {
  zeilen: Einwilligung[];
  typen: Record<string, string>;
  mitPerson: boolean;
  dateLocale: string;
  t: Strings;
}) {
  const zeit = new Intl.DateTimeFormat(dateLocale, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });
  return (
    <Table>
      <Thead>
        {mitPerson && <Th>{t.colPerson}</Th>}
        <Th>{t.colType}</Th>
        <Th>{t.colVersion}</Th>
        <Th>{t.colState}</Th>
        <Th>{t.colAt}</Th>
        <Th>{t.colRevokedAt}</Th>
        <Th>{t.colSource}</Th>
      </Thead>
      <Tbody>
        {zeilen.map((e) => {
          const z = zustand(e);
          return (
            <Tr key={e.id}>
              {mitPerson && (
                <Td>
                  <Link href={`/admin/personen/${e.person_id}`} className="ct-link">
                    {e.person_name ?? e.email ?? t.noName}
                  </Link>
                  {e.person_name && e.email && <span className="ct-help block">{e.email}</span>}
                </Td>
              )}
              <Td>{typen[e.consent_type] ?? e.consent_type}</Td>
              <Td className="text-muted tabular-nums">{e.version}</Td>
              <Td><Badge tone={TON[z]}>{t[`state_${z}`]}</Badge></Td>
              <Td className="text-muted tabular-nums">{zeit.format(new Date(e.granted_at))}</Td>
              <Td className="text-muted tabular-nums">{e.revoked_at ? zeit.format(new Date(e.revoked_at)) : "—"}</Td>
              <Td className="text-muted">{t[`source_${e.source}`] ?? e.source}</Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
}
