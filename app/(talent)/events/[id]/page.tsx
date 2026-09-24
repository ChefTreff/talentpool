import { notFound } from "next/navigation";
import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasLumaKey, lumaClient } from "@/lib/luma/client";
import { isOurEvent, lumaWriteEnabled } from "@/lib/luma/events";
import { toPortalEvent } from "@/lib/luma/mapping";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { neuesFenster } from "@/components/ui/neues-fenster";
import { RegisterButton } from "../RegisterButton";
import { formatEventTime, type EigeneTeilnahme } from "../shared";

export const dynamic = "force-dynamic";

/** Event-Seite im Portal (TAL-007): Beschreibung, Zeit, Ort, Anmelden, teilbarer Luma-Link. */
export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireArea("talent", `/events/${id}`);
  const { locale, t } = await getI18n();
  const tt = t.talentEvents as unknown as Record<string, string>;
  if (!hasLumaKey() || !/^evt-[A-Za-z0-9]+$/.test(id)) notFound();

  const ev = await lumaClient().getEvent(id).catch(() => null);
  if (!ev || ev.visibility === "private" || !isOurEvent(ev)) notFound();
  const e = toPortalEvent(ev);

  const supabase = await createSupabaseServerClient();
  const { data: eigene } = await supabase.rpc("my_community_registrations");
  const status = ((eigene ?? []) as EigeneTeilnahme[]).find((r) => r.luma_event_id === e.lumaId)?.status;
  const jetzt = new Date();
  const vorbei = new Date(e.endAt).getTime() <= jetzt.getTime();

  return (
    <div className="max-w-text">
      <Link href="/events" className="ct-link ct-small">← {tt.back}</Link>
      <div className="mt-2">
        <PageHeader word={tt.word} title={e.name} description={`${formatEventTime(e, locale)}${e.city ? ` · ${e.city}` : ""}`} />
      </div>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {status && <Badge tone="success">{tt[`status_${status}`] ?? status}</Badge>}
          {e.full && <Badge tone="warning">{e.waitlist ? tt.fullWaitlist : tt.full}</Badge>}
          {e.requiresApproval && <Badge>{tt.approval}</Badge>}
          {vorbei && <Badge>{tt.past}</Badge>}
        </div>
        {ev.description_md && <p className="ct-small whitespace-pre-line text-ink">{ev.description_md}</p>}
        <div className="flex flex-wrap items-start gap-2">
          {!status && !vorbei && e.registrationOpen && !(e.full && !e.waitlist) && lumaWriteEnabled() && (
            <RegisterButton lumaEventId={e.lumaId} t={tt} />
          )}
          <ButtonLink href={e.shareUrl} variant="secondary" size="sm" {...neuesFenster}>
            {tt.openLuma}
          </ButtonLink>
        </div>
        <p className="ct-help">{tt.shareHint}</p>
      </Card>
    </div>
  );
}
