import { headers } from "next/headers";
import { neuesFenster } from "@/components/ui/neues-fenster";
import { getI18n } from "@/lib/i18n";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { quellHash } from "@/lib/award/quelle";
import { AppHeader } from "@/components/layout/AppHeader";
import { PortalFooter, DEFAULT_MAILBOX } from "@/components/layout/PortalFooter";
import { HeroBand } from "@/components/ui/HeroBand";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { StimmKnopf } from "./StimmKnopf";

export const dynamic = "force-dynamic";

type Eintrag = {
  id: string | null; name: string; topics: string[]; location: string; description: string; mission: string; project: string;
  website: string | null; university: string | null; founded_year: number | null; active_members: number | null;
  images: string[]; status: string; voted: boolean;
  apply_until: string | null; vote_from: string | null; vote_until: string | null; apply_open: boolean; vote_open: boolean;
};

/**
 * Initiativen-Award, öffentliche Seite (ADM-024): angenommene Bewerbungen und
 * die Abstimmung, ohne Login. Gelesen über die Server-Funktion
 * `award_public_entries` (Service-Rolle) — sie liefert nur inhaltliche Felder,
 * nie die Ansprechperson, und keine Zählerstände. Bilder liegen im privaten
 * Bucket und kommen als signierte Adressen mit kurzer Laufzeit.
 */
export default async function AwardPage() {
  const { t, locale } = await getI18n();
  const a = t.award;
  const admin = createSupabaseAdminClient();
  const [{ data, error }, vocab] = await Promise.all([
    admin.rpc("award_public_entries", { p_ip_hash: quellHash(await headers()) }),
    loadVocabMap(admin, locale),
  ]);
  if (error) console.error("[award] award_public_entries:", error.code, error.message);
  const zeilen = (data ?? []) as Eintrag[];
  const eintraege = zeilen.filter((z) => z.id);
  const fenster = zeilen[0];
  const datum = new Intl.DateTimeFormat(t.meta.dateLocale, { dateStyle: "long" });

  const ersteBilder = eintraege.map((e) => e.images[0]).filter(Boolean);
  const signiert = new Map<string, string>();
  if (ersteBilder.length) {
    const { data: urls } = await admin.storage.from("award-images").createSignedUrls(ersteBilder, 600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signiert.set(u.path, u.signedUrl);
  }

  const lage = !fenster
    ? a.stateUnknown
    : fenster.vote_open && fenster.vote_until
      ? a.voteOpenUntil.replace("{datum}", datum.format(new Date(fenster.vote_until)))
      : fenster.vote_from && new Date(fenster.vote_from) > new Date()
        ? a.voteFrom.replace("{datum}", datum.format(new Date(fenster.vote_from)))
        : a.voteClosed;

  return (
    <>
      <AppHeader />
      <main id="content" className="flex flex-1 flex-col bg-canvas">
        <HeroBand
          eyebrow={a.eyebrow}
          title={a.title}
          highlight={a.highlight}
          lead={a.lead}
          action={fenster?.apply_open ? <ButtonLink href="/award/bewerben">{a.applyCta}</ButtonLink> : undefined}
        />
        <div className="mx-auto w-full max-w-content px-4 py-10 sm:px-6">
          <p className="ct-label text-ink" role="status">{lage}</p>
          {fenster?.apply_open && fenster.apply_until && (
            <p className="ct-help mt-1">{a.applyUntil.replace("{datum}", datum.format(new Date(fenster.apply_until)))}</p>
          )}
          {eintraege.length === 0 ? (
            <div className="mt-6">
              <EmptyState title={a.emptyTitle} description={a.emptyBody} />
            </div>
          ) : (
            <ul className="mt-6 grid gap-4 md:grid-cols-2">
              {eintraege.map((e) => {
                const bild = e.images[0] ? signiert.get(e.images[0]) : undefined;
                return (
                  <Card as="li" key={e.id} className="flex flex-col gap-3 p-0">
                    {bild && (
                      // eslint-disable-next-line @next/next/no-img-element -- signierte Adresse mit kurzer Laufzeit, kein Bildoptimierer
                      <img src={bild} alt="" className="aspect-video w-full rounded-t-ct-lg object-cover" />
                    )}
                    <div className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-2">
                      <div>
                        <h2 className="ct-h3">{e.name}</h2>
                        <p className="ct-small text-muted">
                          {[e.location, e.university, e.founded_year ? a.founded.replace("{jahr}", String(e.founded_year)) : null]
                            .filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {e.status === "finalist" && <Badge tone="accent">{a.finalist}</Badge>}
                        {e.status === "winner" && <Badge tone="success">{a.winner}</Badge>}
                        {e.topics.map((k) => <Badge key={k}>{vlabel(vocab, "award_topic", k)}</Badge>)}
                      </div>
                      <p className="ct-small whitespace-pre-line">{e.description}</p>
                      <details className="ct-small">
                        <summary className="ct-link cursor-pointer pointer-coarse:-my-3 pointer-coarse:py-3">{a.more}</summary>
                        <h3 className="ct-label mt-3">{a.mission}</h3>
                        <p className="whitespace-pre-line">{e.mission}</p>
                        <h3 className="ct-label mt-3">{a.project}</h3>
                        <p className="whitespace-pre-line">{e.project}</p>
                        {e.website && (
                          <p className="mt-3">
                            <a href={e.website.startsWith("http") ? e.website : `https://${e.website}`} className="ct-link" {...neuesFenster}>
                              {a.website}
                            </a>
                          </p>
                        )}
                      </details>
                      <div className="mt-auto pt-2">
                        <StimmKnopf
                          id={e.id as string}
                          offen={Boolean(fenster?.vote_open) && e.status !== "winner"}
                          schonGestimmt={e.voted}
                          name={e.name}
                          t={{ vote: a.vote, voted: a.voted, closed: a.voteButtonClosed, ...a.voteStates }}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </ul>
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
