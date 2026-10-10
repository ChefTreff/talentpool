import Link from "next/link";
import type { ReactNode } from "react";
import { Button, ButtonDownload } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { SectionTabs, type SectionTab } from "@/components/layout/SectionTabs";

type Strings = Record<string, string>;

export type SpaltenGruppe = { gruppe: string; label: string; spalten: { key: string; label: string }[] };

/** Die ersten Zeilen der Tabelle, wie die Datei sie enthält; `gesamt` zählt alle. */
export type Vorschau = { kopf: string[]; zeilen: (string | number)[][]; gesamt: number; max: number };

export type FehlerGrund = "nicht_erlaubt" | "keine_edition" | "fehler";

/**
 * Berichte und Export (ADM-078). Oben die Berichte als Reiter, darunter die Spaltenauswahl — ein Formular mit der **Adresse als Speicher**: „Vorschau aktualisieren“
 * lädt die Seite mit `?spalten=…`, die Auswahl ist ein Lesezeichen wert. Die beiden Knöpfe „Excel laden“ und „CSV laden“ schicken dieselbe Auswahl an den
 * Download (`formAction`), der dieselbe Tabelle baut. Eine Hauptaktion: die Datei. Darunter die Vorschau; ganz unten die Listen mit eigener Quelle (Shuttle,
 * Lounge), die hier verlinkt statt nachgebaut sind.
 *
 * Ohne Skript lauffähig: ein GET-Formular mit Kontrollkästchen, keine Zustände im Browser.
 */
export function BerichteAnsicht({
  bericht,
  tabs,
  hinweis,
  gruppen,
  gewaehlt,
  vorschau,
  fehler,
  t,
}: {
  bericht: string;
  tabs: SectionTab[];
  hinweis: string;
  gruppen: SpaltenGruppe[];
  gewaehlt: string[];
  vorschau: Vorschau | null;
  fehler: FehlerGrund | null;
  t: Strings;
}) {
  const basis = `/admin/speaker/export?bericht=${bericht}`;
  return (
    <>
      <SectionTabs label={t.reportsLabel} items={tabs} />
      <p className="ct-help -mt-3 mb-6 max-w-text">{hinweis}</p>

      <form method="get" action="/admin/speaker/export" className="mb-6">
        <input type="hidden" name="bericht" value={bericht} />
        <Card>
          <CardHeader ebene="h2" title={t.columnsTitle} description={t.columnsHint} />
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {gruppen.map((g) => (
              <fieldset key={g.gruppe} className="min-w-0">
                <legend className="ct-eyebrow mb-1 text-muted">{g.label}</legend>
                <div className="flex flex-col">
                  {g.spalten.map((s) => (
                    <Checkbox key={s.key} name="spalten" value={s.key} defaultChecked={gewaehlt.includes(s.key)} label={s.label} />
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
            <Button type="submit" variant="secondary">
              {t.refresh}
            </Button>
            <Button type="submit" formAction="/admin/speaker/export/datei" name="format" value="xlsx">
              {t.downloadXlsx}
            </Button>
            <Button type="submit" variant="ghost" formAction="/admin/speaker/export/datei" name="format" value="csv">
              {t.downloadCsv}
            </Button>
            <span className="flex flex-wrap gap-x-4 gap-y-1 sm:ml-auto">
              <Link href={`${basis}&spalten=alle`} className="ct-link ct-small">
                {t.columnsAll}
              </Link>
              <Link href={basis} className="ct-link ct-small">
                {t.columnsDefault}
              </Link>
            </span>
          </div>
        </Card>
      </form>

      <section aria-labelledby="vorschau" className="mb-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="vorschau" className="ct-h2 text-ink">
            {t.previewTitle}
          </h2>
          {vorschau && vorschau.gesamt > 0 && (
            <span className="ct-help">{vorschau.gesamt === 1 ? t.previewCountOne : t.previewCount.replace("{n}", String(vorschau.gesamt))}</span>
          )}
        </div>
        {fehler ? (
          <EmptyState
            title={fehler === "nicht_erlaubt" ? t.notAllowedTitle : fehler === "keine_edition" ? t.noEditionTitle : t.errorTitle}
            description={fehler === "nicht_erlaubt" ? t.notAllowedBody : fehler === "keine_edition" ? t.noEditionBody : t.errorBody}
          />
        ) : !vorschau || vorschau.gesamt === 0 ? (
          <EmptyState title={t.emptyTitle} description={t.emptyBody} />
        ) : (
          <>
            <Vorschautabelle vorschau={vorschau} />
            {vorschau.gesamt > vorschau.max && (
              <p className="ct-help mt-2">{t.previewCut.replace("{max}", String(vorschau.max)).replace("{n}", String(vorschau.gesamt))}</p>
            )}
          </>
        )}
      </section>

      <Card>
        <CardHeader ebene="h2" title={t.otherTitle} description={t.otherHint} />
        <ul className="flex flex-col divide-y">
          <WeitereListe name={t.shuttleList} hinweis={t.shuttleHint}>
            <ButtonDownload href="/api/admin/shuttle/export?format=csv" size="sm">
              {t.csv}
            </ButtonDownload>
            <ButtonDownload href="/api/admin/shuttle/export?format=xlsx" size="sm">
              {t.excel}
            </ButtonDownload>
          </WeitereListe>
          <WeitereListe name={t.loungeList} hinweis={t.loungeHint}>
            <ButtonDownload href="/admin/speaker-tickets/lounge-liste" size="sm">
              {t.csv}
            </ButtonDownload>
          </WeitereListe>
        </ul>
      </Card>
    </>
  );
}

function WeitereListe({ name, hinweis, children }: { name: string; hinweis: string; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-56">
        <p className="ct-label text-ink">{name}</p>
        <p className="ct-help">{hinweis}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </li>
  );
}

/** Die Spalten der Auswahl in der Reihenfolge des Berichts. Lange Werte werden abgeschnitten und stehen im Tooltip — in der Datei steht alles. */
function Vorschautabelle({ vorschau }: { vorschau: Vorschau }) {
  // Eine Spalte, die nur Zahlen trägt, steht rechts (wie überall im Portal).
  const zahl = vorschau.kopf.map((_, i) => vorschau.zeilen.every((z) => typeof z[i] === "number"));
  return (
    <Table>
      <Thead>
        {vorschau.kopf.map((k, i) => (
          <Th key={i} numeric={zahl[i]} className="whitespace-nowrap">
            {k}
          </Th>
        ))}
      </Thead>
      <Tbody>
        {vorschau.zeilen.map((z, r) => (
          <Tr key={r}>
            {z.map((c, i) => (
              <Td key={i} numeric={zahl[i]} className="max-w-64 truncate">
                <span title={String(c)}>{c}</span>
              </Td>
            ))}
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
