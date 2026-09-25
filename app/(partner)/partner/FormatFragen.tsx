import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/shared";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { EigeneFrageAntrag } from "@/components/partner/EigeneFrageAntrag";
import { FragenAuswahl } from "@/components/partner/FragenAuswahl";
import { MAX_EIGENE_FRAGEN } from "@/components/partner/fragen";
import { ladeFragen } from "./bewerbungen";
import type { PartnerFormatSession } from "./talk/types";

/**
 * Bewerbungsfragen eigener Formate (PART-045, PART-082): was das Team gesetzt
 * hat (nur lesen), Katalogfragen, die Partner wählen dürfen, und bis zu zwei
 * eigene Fragen je Session, die das Programm-Team freigibt.
 *
 * Der Katalog kommt direkt aus `question_catalog` (für Angemeldete lesbar);
 * Upload-Fragen (`file`) bleiben draussen, solange das Bewerbungsformular sie
 * nicht kann — dieselbe Regel wie im Board.
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
  const { data: katalogZeilen } = await supabase
    .from("question_catalog")
    .select("id, label_de, label_en")
    .eq("partner_selectable", true)
    .eq("active", true)
    .neq("type", "file")
    .order("sort_order");
  const waehlbar = ((katalogZeilen ?? []) as { id: string; label_de: string; label_en: string }[]).map((q) => ({
    id: q.id,
    label: (locale === "en" ? q.label_en : q.label_de) || q.label_de,
  }));
  const waehlbarIds = new Set(waehlbar.map((q) => q.id));
  const fragenJe = await Promise.all(sessions.map((x) => ladeFragen(supabase, x.id)));

  return (
    <div className="flex flex-col gap-6">
      {sessions.map((x, i) => {
        const fragen = fragenJe[i];
        const team = fragen.filter((f) => f.question_id && !waehlbarIds.has(f.question_id));
        const eigene = fragen.filter((f) => !f.question_id);
        const text = (f: (typeof fragen)[number]) => (locale === "en" ? f.label_en : f.label_de);
        return (
          <Card key={x.id}>
            <CardHeader title={titel(x)} description={s.questionsLead} />
            <div className="flex flex-col gap-6">
              {team.length > 0 && (
                <section aria-label={s.teamQuestionsTitle}>
                  <h3 className="ct-label text-ink">{s.teamQuestionsTitle}</h3>
                  <p className="ct-help mt-1">{s.teamQuestionsHint}</p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {team.map((f) => (
                      <li key={f.id} className="ct-small flex flex-wrap items-center gap-2 text-ink">
                        {text(f)}
                        {f.required && <Badge>{s.required}</Badge>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section aria-label={s.catalogTitle}>
                <h3 className="ct-label text-ink">{s.catalogTitle}</h3>
                {waehlbar.length === 0 ? (
                  <p className="ct-help mt-1">{s.catalogEmpty}</p>
                ) : (
                  <div className="mt-2">
                    <FragenAuswahl
                      sessionId={x.id}
                      waehlbar={waehlbar}
                      gewaehlt={fragen.filter((f) => f.question_id && waehlbarIds.has(f.question_id)).map((f) => f.question_id!)}
                      canEdit={canEdit}
                      t={s}
                      rpcMessages={t.rpc}
                    />
                  </div>
                )}
              </section>

              <section aria-label={s.ownTitle}>
                <h3 className="ct-label text-ink">{s.ownTitle}</h3>
                <p className="ct-help mt-1">{s.ownHint.replace("{max}", String(MAX_EIGENE_FRAGEN))}</p>
                {eigene.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-2">
                    {eigene.map((f) => (
                      <li key={f.id} className="flex flex-col gap-0.5">
                        <span className="ct-small flex flex-wrap items-center gap-2 text-ink">
                          {text(f)}
                          <Badge tone={f.approved_at ? "success" : "warning"}>{f.approved_at ? s.ownApproved : s.ownPending}</Badge>
                        </span>
                        {f.purpose && <span className="ct-help">{s.ownPurposeShown.replace("{zweck}", f.purpose)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3">
                  {eigene.length >= MAX_EIGENE_FRAGEN ? (
                    <p className="ct-help">{s.ownMaxReached}</p>
                  ) : canEdit ? (
                    <EigeneFrageAntrag sessionId={x.id} t={{ ...s, cancel: t.cancel }} rpcMessages={t.rpc} />
                  ) : null}
                </div>
              </section>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
