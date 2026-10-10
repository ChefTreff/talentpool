import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/shared";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { GespraechFragen } from "@/components/partner/GespraechFragen";
import { TischUebernehmen } from "@/components/partner/TischUebernehmen";
import { TischVorgabe } from "@/components/partner/TischVorgabe";
import { fragenSatz, tischStand } from "@/lib/partner/tischvorgabe";
import { fragenAufteilen } from "@/components/partner/fragen";
import { EigeneFragen, FragenAbschnitte, TeamFragen } from "./FragenAbschnitte";
import { ladeFragenJe, ladeWaehlbareFragen } from "./bewerbungen";
import type { PartnerFormatSession } from "./talk/types";

/**
 * Bewerbungsfragen **eines Tisches** der Interview Tables, ab zwei Gesprächen (PART-150, Plan-Entscheidung 09.10.2026: Tischvorgabe mit Übernahme).
 *
 * Oben die Karte „Tischvorgabe“: die Fragen des **ersten Gesprächs** (frühester Beginn), mit den bekannten Abschnitten — Fragen des Teams, Katalogwahl,
 * eigene Fragen — und dem Hauptknopf „Speichern und auf alle n Gespräche übernehmen“. Darunter die Liste der Gespräche: je Zeile ob es der Vorgabe folgt
 * oder **abweichend** ist (der Vergleich der Fragensätze, `fragenSatz` — gespeichert wird nichts), die Zeilenaktionen „Fragen ändern“ (Schubfach mit den
 * Abschnitten dieses Gesprächs) und, bei einem abweichenden, „Tischvorgabe übernehmen“. Alle Gespräche des Tisches kommen mit **einer** Abfrage
 * (`ladeFragenJe`).
 *
 * Das erste Gespräch ist die Vorgabe, bis es wegfällt (abgesagt) — dann rückt das nächste nach. Die Karte bearbeitet seine Fragen mit denselben Funktionen
 * wie jedes Gespräch; `partner_copy_table_questions` prüft selbst, dass Quelle und Ziele zu derselben Organisation und demselben Tisch gehören.
 */
export async function TischFragen({
  supabase,
  sessions,
  canEdit,
  locale,
  titel,
  t,
}: {
  supabase: SupabaseClient;
  /** Die Gespräche **eines** Tisches, mindestens zwei. */
  sessions: PartnerFormatSession[];
  canEdit: boolean;
  locale: Locale;
  titel: (x: PartnerFormatSession) => string;
  /** `tisch` ist `partnerInterviewTables`, `bewerbung` ist `partnerBewerbung`. */
  t: { tisch: Record<string, string>; bewerbung: Record<string, string>; rpc: Record<string, string>; cancel: string };
}) {
  const v = t.tisch;
  const s = t.bewerbung;
  const waehlbar = await ladeWaehlbareFragen(supabase, locale);
  const waehlbarIds = new Set(waehlbar.map((q) => q.id));
  const fragenJe = await ladeFragenJe(supabase, sessions.map((x) => x.id));
  const fragenVon = (x: PartnerFormatSession) => fragenJe.get(x.id) ?? [];
  const { vorgabe, zeilen, ziele } = tischStand(sessions, (x) => fragenSatz(fragenVon(x), waehlbarIds));
  if (!vorgabe) return null;

  const titelJe = Object.fromEntries(sessions.map((x) => [x.id, titel(x)]));
  const { team, gewaehlt, eigene } = fragenAufteilen(fragenVon(vorgabe), waehlbarIds);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          ebene="h2"
          title={v.vorgabeTitle}
          description={v.vorgabeLead.replace("{n}", String(sessions.length)).replace("{gespraech}", titel(vorgabe))}
        />
        <TischVorgabe
          carrierId={vorgabe.id}
          zielIds={ziele.map((x) => x.id)}
          anzahl={sessions.length}
          waehlbar={waehlbar}
          gewaehlt={gewaehlt}
          canEdit={canEdit}
          titelJe={titelJe}
          t={v}
          s={s}
          rpcMessages={t.rpc}
          team={<TeamFragen team={team} locale={locale} s={s} />}
          eigene={<EigeneFragen sessionId={vorgabe.id} eigene={eigene} canEdit={canEdit} locale={locale} s={s} rpc={t.rpc} cancel={t.cancel} />}
        />
      </Card>

      <Card>
        <CardHeader ebene="h2" title={v.listTitle} description={v.listLead} />
        <ul className="flex flex-col divide-y">
          {zeilen.map(({ gespraech: x, istVorgabe, abweichend }) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="ct-label text-ink">{titel(x)}</p>
                <p className="mt-1">
                  <Badge tone={istVorgabe ? "accent" : abweichend ? "warning" : "success"}>
                    {istVorgabe ? v.rowFirst : abweichend ? v.rowDiffers : v.rowSame}
                  </Badge>
                </p>
              </div>
              {!istVorgabe && (
                <div className="flex flex-wrap items-center gap-2">
                  <GespraechFragen titel={titel(x)} label={canEdit ? v.rowChange : v.rowView} hinweis={v.rowChangeHint} schliessen={v.rowClose}>
                    <FragenAbschnitte
                      sessionId={x.id}
                      fragen={fragenVon(x)}
                      waehlbar={waehlbar}
                      canEdit={canEdit}
                      locale={locale}
                      s={s}
                      rpc={t.rpc}
                      cancel={t.cancel}
                    />
                  </GespraechFragen>
                  {canEdit && abweichend && (
                    <TischUebernehmen
                      carrierId={vorgabe.id}
                      zielId={x.id}
                      titel={titel(x)}
                      titelJe={titelJe}
                      label={v.rowAdopt}
                      fertig={v.rowAdopted}
                      fehlerVorlage={v.vorgabeErrorAt}
                      rpcMessages={t.rpc}
                    />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
