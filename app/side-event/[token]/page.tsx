import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppHeader } from "@/components/layout/AppHeader";
import { PortalFooter, DEFAULT_MAILBOX } from "@/components/layout/PortalFooter";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getI18n } from "@/lib/i18n";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { quellHash } from "@/lib/award/quelle";
import { istToken, leseLinkAntwort } from "@/lib/side-event/link";
import { eventBeginn } from "@/lib/side-event/zeit";
import { AntwortKnoepfe } from "./AntwortKnoepfe";

export const dynamic = "force-dynamic";

/**
 * Kein Suchindex, kein Referrer: der Token steht im Pfad und ist das ganze Geheimnis dieser Seite. (`next.config.ts` setzt dieselben Regeln
 * zusätzlich als Header.)
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/**
 * Die Seite hinter dem Link aus der Einladungsmail (ADM-077, SPK-091): Zu- oder Absage zu einem Side Event **ohne Anmeldung**.
 *
 * **Sie zeigt nur an.** Gelesen wird über `side_event_respond_by_token` ohne Stand — Mail-Scanner rufen Links vorab ab, ein GET darf nichts
 * entscheiden. Erst der Klick auf einen Knopf schickt einen POST (`AntwortKnoepfe` → `/api/side-event/antwort`).
 *
 * **Keine Personendaten.** Die Funktion liefert Titel, Zeit und Ort des Events und den Stand der Einladung — keinen Namen, keine Adresse,
 * keine Zahl anderer Gäste; `leseLinkAntwort` nimmt nur das davon, was hier gezeigt werden darf. Ein unbekannter, abgelaufener, ersetzter oder
 * unveröffentlichter Link sieht von außen gleich aus (`invalid`): die Seite verrät nicht, ob es den Token je gab.
 */
export default async function SideEventLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { locale, t } = await getI18n("en");
  const s = t.sideEventPublic;

  // Die Form des Tokens prüfen wir selbst — alles andere ist ein Rateversuch, und die Datenbank muss ihn nicht erst sehen.
  let antwort = leseLinkAntwort(null);
  if (istToken(token)) {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("side_event_respond_by_token", {
      p_token: token,
      p_status: null,
      p_ip_hash: quellHash(await headers()),
    });
    if (error) console.error("[side-event] side_event_respond_by_token:", error.code, error.message);
    else antwort = leseLinkAntwort(data);
  }

  const e = antwort.event;
  const titel = e ? (locale === "en" ? e.title_en : e.title_de) || e.title_de : null;
  const zeigeEvent = e !== null && (antwort.state === "ok" || antwort.state === "closed");

  return (
    <>
      <AppHeader />
      <main id="content" className="flex flex-1 flex-col bg-canvas">
        <div className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
          {zeigeEvent && e && titel ? (
            <>
              <p className="ct-eyebrow text-muted">{s.eyebrow}</p>
              <h1 className="ct-h1 mt-1 text-ink">{titel}</h1>
              <p className="ct-help mt-2">{s.lead}</p>

              <Card className="mt-6">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="ct-help">{s.when}</dt>
                    <dd className="ct-label mt-1 text-ink tabular-nums">{eventBeginn(t.meta.dateLocale, e.starts_at)}</dd>
                  </div>
                  <div>
                    <dt className="ct-help">{s.where}</dt>
                    <dd className="ct-label mt-1 text-ink">
                      {e.location}
                      {e.address ? `, ${e.address}` : ""}
                    </dd>
                  </div>
                </dl>

                <div className="mt-6 border-t pt-6">
                  {antwort.state === "closed" ? (
                    <div className="flex flex-col gap-3">
                      <p className="ct-label text-ink" role="status">
                        {antwort.status === "yes" ? s.statusYes : antwort.status === "no" ? s.statusNo : s.statusInvited}
                      </p>
                      <p className="ct-help">{s.closed}</p>
                    </div>
                  ) : (
                    <AntwortKnoepfe
                      token={token}
                      status={antwort.status ?? "invited"}
                      t={{
                        yes: s.yes,
                        no: s.no,
                        statusInvited: s.statusInvited,
                        statusYes: s.statusYes,
                        statusNo: s.statusNo,
                        doneYes: s.doneYes,
                        doneNo: s.doneNo,
                        changeHint: s.changeHint,
                        closed: s.closed,
                        full: s.full,
                        invalid: s.invalidBody,
                        rateLimited: s.rateLimited,
                        error: s.error,
                      }}
                    />
                  )}
                </div>
              </Card>
              <p className="ct-help mt-4">
                <a className="ct-link" href="/speaker">
                  {s.portalLink}
                </a>
              </p>
            </>
          ) : antwort.state === "rate_limited" ? (
            <>
              <h1 className="ct-h1 text-ink">{s.rateLimitedTitle}</h1>
              <p className="ct-help mt-2">{s.rateLimited}</p>
            </>
          ) : (
            <>
              <h1 className="ct-h1 text-ink">{s.invalidTitle}</h1>
              <p className="ct-help mt-2">{s.invalidBody}</p>
              <div className="mt-6">
                <ButtonLink href="/speaker" variant="secondary">
                  {s.portalLink}
                </ButtonLink>
              </div>
            </>
          )}

          <div className="mt-10">
            <PortalFooter
              mailbox={DEFAULT_MAILBOX}
              mailboxLabel={t.common.supportMailbox}
              imprintLabel={t.common.imprint}
              privacyLabel={t.common.privacy}
            />
          </div>
        </div>
      </main>
    </>
  );
}
