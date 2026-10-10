import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/shared";
import { Card, CardHeader } from "@/components/ui/Card";
import { FragenAbschnitte } from "./FragenAbschnitte";
import { ladeFragenJe, ladeWaehlbareFragen } from "./bewerbungen";
import type { PartnerFormatSession } from "./talk/types";

/**
 * Bewerbungsfragen eigener Formate (PART-045, PART-082): was das Team gesetzt
 * hat (nur lesen), Katalogfragen, die Partner wählen dürfen, und bis zu zwei
 * eigene Fragen je Session, die das Programm-Team freigibt — je Gespräch eine
 * Karte mit denselben drei Abschnitten (`FragenAbschnitte`).
 *
 * Der Katalog kommt direkt aus `question_catalog` (für Angemeldete lesbar);
 * Upload-Fragen (`file`) bleiben draussen, solange das Bewerbungsformular sie
 * nicht kann — dieselbe Regel wie im Board (`ladeWaehlbareFragen`).
 *
 * Die Interview Tables ab zwei Gesprächen zeigen stattdessen die Tischvorgabe
 * (`TischFragen`, PART-150); hier bleiben Masterclass, Side-Event und ein
 * einzelnes Gespräch.
 */
export async function FormatFragen({
  supabase,
  sessions,
  canEdit,
  locale,
  titel,
  t,
}: {
  supabase: SupabaseClient;
  sessions: PartnerFormatSession[];
  canEdit: boolean;
  locale: Locale;
  titel: (x: PartnerFormatSession) => string;
  t: { bewerbung: Record<string, string>; rpc: Record<string, string>; cancel: string };
}) {
  const s = t.bewerbung;
  const waehlbar = await ladeWaehlbareFragen(supabase, locale);
  const fragenJe = await ladeFragenJe(supabase, sessions.map((x) => x.id));

  return (
    <div className="flex flex-col gap-6">
      {sessions.map((x) => (
        <Card key={x.id}>
          <CardHeader ebene="h2" title={titel(x)} description={s.questionsLead} />
          <FragenAbschnitte
            sessionId={x.id}
            fragen={fragenJe.get(x.id) ?? []}
            waehlbar={waehlbar}
            canEdit={canEdit}
            locale={locale}
            s={s}
            rpc={t.rpc}
            cancel={t.cancel}
          />
        </Card>
      ))}
    </div>
  );
}
