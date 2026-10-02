import Link from "next/link";
import { neuesFenster } from "@/components/ui/neues-fenster";
import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { AwardSteuerung } from "./AwardSteuerung";

export const dynamic = "force-dynamic";

export type AwardBewerbung = {
  id: string; name: string; topics: string[]; location: string; description: string; mission: string; project: string;
  // K-51: nach der Löschfrist (14 Monate nach dem Summit) leer.
  contact_first_name: string | null; contact_last_name: string | null; contact_email: string | null; founded_year: number | null;
  active_members: number | null; website: string | null; university: string | null; notes: string | null;
  images: string[]; status: string; source: string; organization_id: string | null; organization_name: string | null;
  votes: number; created_at: string; decided_at: string | null; decided_by_name: string | null;
};

const TON: Record<string, BadgeTone> = { submitted: "warning", accepted: "accent", finalist: "accent", winner: "success", rejected: "neutral" };

/**
 * Initiativen-Award im Admin (ADM-024): alle Bewerbungen der Edition mit
 * Ansprechperson und Stimmen, Status (angenommen = öffentlich zur Abstimmung),
 * Verknüpfung mit einer Organisation (Initiativen, die auch Partner sind),
 * Löschen. Die Fristen stehen unter /admin/fristen (Platzhalter bis Konrad sie setzt).
 */
export default async function AwardAdminPage() {
  await requireAdminSection("initiatives", "/admin/initiativen/award");
  const { t, locale } = await getI18n("de");
  const a = t.awardAdmin as Record<string, string>;
  const supabase = await createSupabaseServerClient();
  const [liste, orgs, vocab] = await Promise.all([
    supabase.rpc("award_applications_admin"),
    // `organization` ist für `authenticated` nicht lesbar (0042) — Service-Rolle, erst nach der Abschnittsprüfung oben.
    createSupabaseAdminClient().from("organization").select("id, legal_name, communication_name").eq("type", "initiative").eq("active", true).order("legal_name"),
    loadVocabMap(supabase, locale),
  ]);
  const zeilen = (liste.data ?? []) as AwardBewerbung[];
  const organisationen = ((orgs.data ?? []) as { id: string; legal_name: string | null; communication_name: string | null }[])
    .map((o) => ({ value: o.id, label: o.communication_name?.trim() || o.legal_name || o.id }));

  // Bilder aus dem privaten Bucket: signierte Adressen, erst nach der Abschnittsprüfung oben.
  const pfade = zeilen.flatMap((z) => z.images);
  const signiert = new Map<string, string>();
  if (pfade.length) {
    const { data: urls } = await createSupabaseAdminClient().storage.from("award-images").createSignedUrls(pfade, 900);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signiert.set(u.path, u.signedUrl);
  }
  const datum = new Intl.DateTimeFormat(t.meta.dateLocale, { dateStyle: "medium" });
  const zaehle = (s: string) => zeilen.filter((z) => z.status === s).length;

  return (
    <>
      <PageHeader
        word={t.admin.words.initiatives}
        title={a.title}
        description={a.lead}
        actions={
          <>
            <ButtonLink href="/award" variant="secondary" size="sm" {...neuesFenster}>{a.publicPage}</ButtonLink>
            <ButtonLink href="/admin/fristen" variant="ghost" size="sm">{a.deadlines}</ButtonLink>
          </>
        }
      />
      {liste.error ? (
        <EmptyState title={a.errorTitle} description={a.errorBody} />
      ) : zeilen.length === 0 ? (
        <EmptyState title={a.emptyTitle} description={a.emptyBody} />
      ) : (
        <>
          <p className="ct-label mb-4 text-ink">
            {a.summary
              .replace("{gesamt}", String(zeilen.length))
              .replace("{neu}", String(zaehle("submitted")))
              .replace("{oeffentlich}", String(zaehle("accepted") + zaehle("finalist") + zaehle("winner")))}
          </p>
          <ul className="flex flex-col gap-4">
            {zeilen.map((z) => (
              <Card as="li" key={z.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="ct-h3">{z.name}</h2>
                    <p className="ct-small text-muted">
                      {[z.location, z.university, z.founded_year ? a.founded.replace("{jahr}", String(z.founded_year)) : null,
                        z.active_members != null ? a.members.replace("{n}", String(z.active_members)) : null]
                        .filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TON[z.status] ?? "neutral"}>{a[`status_${z.status}`] ?? z.status}</Badge>
                    <span className="ct-label tabular-nums">{a.votes.replace("{n}", String(z.votes))}</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {z.topics.map((k) => <Badge key={k}>{vlabel(vocab, "award_topic", k)}</Badge>)}
                </div>
                <p className="ct-small mt-3">
                  {a.contact}:{" "}
                  {z.contact_email ? (
                    <>
                      {z.contact_first_name} {z.contact_last_name} ·{" "}
                      <a href={`mailto:${z.contact_email}`} className="ct-link">{z.contact_email}</a>
                    </>
                  ) : (
                    <span className="text-muted">{a.contactPurged}</span>
                  )}
                  {z.website && (
                    <>
                      {" · "}
                      <a href={z.website.startsWith("http") ? z.website : `https://${z.website}`} className="ct-link" {...neuesFenster}>{a.website}</a>
                    </>
                  )}
                </p>
                <details className="ct-small mt-3">
                  <summary className="ct-link cursor-pointer pointer-coarse:-my-3 pointer-coarse:py-3">{a.details}</summary>
                  <h3 className="ct-label mt-3">{a.description}</h3>
                  <p className="whitespace-pre-line">{z.description}</p>
                  <h3 className="ct-label mt-3">{a.mission}</h3>
                  <p className="whitespace-pre-line">{z.mission}</p>
                  <h3 className="ct-label mt-3">{a.project}</h3>
                  <p className="whitespace-pre-line">{z.project}</p>
                  {z.notes && (
                    <>
                      <h3 className="ct-label mt-3">{a.notes}</h3>
                      <p className="whitespace-pre-line">{z.notes}</p>
                    </>
                  )}
                </details>
                {z.images.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {z.images.map((p, n) => signiert.get(p) ? (
                      <a key={p} href={signiert.get(p)} {...neuesFenster} className="ct-link ct-small">
                        {a.image.replace("{n}", String(n + 1))}
                      </a>
                    ) : null)}
                  </div>
                ) : (
                  <p className="ct-help mt-3">{a.noImages}</p>
                )}
                <p className="ct-help mt-3 text-muted">
                  {a.received.replace("{datum}", datum.format(new Date(z.created_at)))}
                  {z.decided_at && ` · ${a.decided.replace("{datum}", datum.format(new Date(z.decided_at))).replace("{name}", z.decided_by_name ?? "—")}`}
                  {z.organization_id && (
                    <>
                      {" · "}
                      <Link href="/admin/initiativen" className="ct-link">{z.organization_name}</Link>
                    </>
                  )}
                </p>
                <AwardSteuerung
                  id={z.id}
                  name={z.name}
                  status={z.status}
                  organisation={z.organization_id}
                  organisationen={organisationen}
                  t={a}
                  common={{ cancel: t.common.cancel, saved: t.common.saved, none: t.common.none }}
                  rpcMessages={t.rpc as Record<string, string>}
                />
              </Card>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
