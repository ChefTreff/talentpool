import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadPortalEvents, lumaWriteEnabled } from "@/lib/luma/events";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { neuesFenster } from "@/components/ui/neues-fenster";
import { RegisterButton } from "./RegisterButton";
import { formatEventTime, type EigeneTeilnahme } from "./shared";

export const dynamic = "force-dynamic";

/**
 * „Events" — unsere Community-Events aus dem Luma-Kalender (TAL-007, D12
 * Hybrid). Die Liste kommt live aus Luma; angemeldet wird mit den
 * Profildaten; der teilbare Link bleibt die Luma-Seite. Die eigene Teilnahme
 * steht im Profil (`registration`, Quelle `luma`) und markiert hier
 * „Angemeldet".
 */
export default async function EventsPage() {
  await requireArea("talent", "/events");
  const { locale, t } = await getI18n();
  const tt = t.talentEvents as unknown as Record<string, string>;
  const supabase = await createSupabaseServerClient();

  const [{ state, events }, { data: eigene }] = await Promise.all([
    loadPortalEvents(),
    supabase.rpc("my_community_registrations"),
  ]);
  const stand = new Map(((eigene ?? []) as EigeneTeilnahme[]).map((r) => [r.luma_event_id, r.status]));
  const live = lumaWriteEnabled();

  return (
    <>
      <PageHeader word={tt.word} title={tt.title} description={tt.lead} />

      {state !== "ok" ? (
        <EmptyState
          title={state === "no_key" ? tt.notConnectedTitle : tt.errorTitle}
          description={state === "no_key" ? tt.notConnectedBody : tt.errorBody}
        />
      ) : events.length === 0 ? (
        <EmptyState title={tt.emptyTitle} description={tt.emptyBody} />
      ) : (
        <div className="flex flex-col gap-4">
          {!live && <p className="ct-help">{tt.notLiveHint}</p>}
          {events.map((e) => {
            const status = stand.get(e.lumaId);
            return (
              <Card key={e.lumaId} as="article" className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="ct-eyebrow text-muted">{formatEventTime(e, locale)}{e.city ? ` · ${e.city}` : ""}</p>
                  <h2 className="ct-h3 mt-1 text-ink">
                    <Link href={`/events/${encodeURIComponent(e.lumaId)}`} className="ct-link">
                      {e.name}
                    </Link>
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {status && <Badge tone="success">{tt[`status_${status}`] ?? status}</Badge>}
                    {e.full && <Badge tone="warning">{e.waitlist ? tt.fullWaitlist : tt.full}</Badge>}
                    {e.requiresApproval && <Badge>{tt.approval}</Badge>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-start gap-2">
                  {!status && e.registrationOpen && !(e.full && !e.waitlist) && live && (
                    <RegisterButton lumaEventId={e.lumaId} t={tt} />
                  )}
                  <ButtonLink href={e.shareUrl} variant="secondary" size="sm" {...neuesFenster}>
                    {tt.openLuma}
                  </ButtonLink>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
