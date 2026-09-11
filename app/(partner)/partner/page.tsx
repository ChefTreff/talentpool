import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { Badge } from "@/components/ui/Badge";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "./org";
import { orgLabel, type PartnerOverview } from "./types";
import { Countdown } from "./Countdown";

export const dynamic = "force-dynamic";

const PARTNER_MAILBOX = "partner@chef-treff.de";

export default async function PartnerDashboard() {
  await requireArea("partner", "/partner");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();

  // Rolle `partner_contact` ohne Mitgliedschaft: der Bereich steht offen, es
  // gibt nur nichts zu zeigen. Das ist kein Fehler, sondern ein Zustand.
  if (!current) {
    return (
      <>
        <PageHeader title={t.partner.title} description={t.partner.lead} />
        <EmptyState
          title={t.partner.noOrgTitle}
          description={t.partner.noOrgBody}
          action={
            <a className="ct-link" href={`mailto:${PARTNER_MAILBOX}`}>
              {PARTNER_MAILBOX}
            </a>
          }
        />
      </>
    );
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: overviewJson }, vocab] = await Promise.all([
    supabase.rpc("partner_overview", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    loadVocabMap(supabase, locale),
  ]);
  const o = (overviewJson ?? null) as PartnerOverview | null;

  if (!o) {
    return (
      <>
        <PageHeader title={t.partner.title} description={t.partner.lead} />
        <EmptyState title={t.partner.noOrgTitle} description={t.partner.noOrgBody} />
      </>
    );
  }

  const categories = vgroup(vocab, "product_category");
  const dateTime = new Intl.DateTimeFormat(t.meta.dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const productName = (p: { name_de: string | null; name_en: string | null }) =>
    (locale === "en" ? p.name_en : p.name_de) ?? p.name_de ?? p.name_en ?? "—";
  const deadlineLabel = (d: { label_de: string | null; label_en: string | null; key: string }) =>
    (locale === "en" ? d.label_en : d.label_de) ?? d.label_de ?? d.key;

  const tickets = o.ticket_allocations.reduce(
    (acc, a) => ({ used: acc.used + a.used_count, total: acc.total + a.quantity }),
    { used: 0, total: 0 },
  );
  // Seit Migration 0051 sagt das Kontingent, ob vivenu schon so weit ist.
  // Solange nicht, stehen Menge und Pass-Typ fest, Code und Link fehlen noch.
  const ticketsPending =
    o.ticket_allocations.length > 0 &&
    o.ticket_allocations.every((a) => a.status === "pending_vivenu");
  const ticketsBroken = o.ticket_allocations.some((a) => a.status === "error");
  const status = o.edition.onboarding_status;
  // Fristen, die noch kommen — vergangene helfen auf dem Dashboard nicht.
  const upcoming = o.deadlines
    .filter((d) => d.due_at && new Date(d.due_at) > new Date())
    .slice(0, 4);

  return (
    <>
      <PageHeader
        title={orgLabel(o.org)}
        description={`${t.partner.lead} · ${current.edition_name ?? ""}`}
      />

      {status !== "filled" && status !== "call_done" && (
        <Card className="mb-6 border-accent-soft bg-accent-soft">
          <h2 className="ct-h3 text-accent-deep">{t.partner.onboardingOpenTitle}</h2>
          <p className="ct-help mt-1 text-accent-deep">{t.partner.onboardingOpenBody}</p>
          <Link href="/partner/onboarding" className="ct-link mt-3 inline-block">
            {t.partner.onboardingStart}
          </Link>
        </Card>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t.partner.statChecklist}
          value={`${o.checklist.done} / ${o.checklist.total}`}
          hint={
            o.checklist.overdue > 0
              ? `${o.checklist.overdue} ${t.partner.statOverdue}`
              : `${o.checklist.open} ${t.partner.statOpen}`
          }
        />
        <StatCard
          label={t.partner.statTickets}
          value={o.ticket_allocations.length > 0 ? `${tickets.used} / ${tickets.total}` : "—"}
          hint={
            o.ticket_allocations.length === 0
              ? t.partner.statNoTickets
              : ticketsBroken
                ? t.partner.statTicketsError
                : ticketsPending
                  ? t.partner.statTicketsPending
                  : t.partner.statTicketsHint
          }
        />
        <StatCard label={t.partner.statProducts} value={o.products.length} />
        <StatCard label={t.partner.statContacts} value={o.contacts_count} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="ct-h3 text-ink">{t.partner.checklistTitle}</h2>
          <p className="ct-help mt-1">
            {t.partner.checklistDone
              .replace("{done}", String(o.checklist.done))
              .replace("{total}", String(o.checklist.total))}
          </p>
          <div
            className="mt-3 h-2 w-full overflow-hidden rounded-ct-sm bg-surface-hover"
            role="img"
            aria-label={t.partner.checklistDone
              .replace("{done}", String(o.checklist.done))
              .replace("{total}", String(o.checklist.total))}
          >
            <div
              className="h-full bg-accent"
              style={{
                width: `${o.checklist.total > 0 ? Math.round((o.checklist.done / o.checklist.total) * 100) : 0}%`,
              }}
            />
          </div>
          <dl className="ct-help mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <div className="flex gap-1">
              <dt className="font-semibold">{t.partner.statOpen}:</dt>
              <dd className="tabular-nums">{o.checklist.open}</dd>
            </div>
            {o.checklist.rejected > 0 && (
              <div className="flex gap-1">
                <dt className="font-semibold">{t.partner.statRejected}:</dt>
                <dd className="tabular-nums">{o.checklist.rejected}</dd>
              </div>
            )}
            {o.checklist.overdue > 0 && (
              <div className="flex gap-1 text-error-ink">
                <dt className="font-semibold">{t.partner.statOverdue}:</dt>
                <dd className="tabular-nums">{o.checklist.overdue}</dd>
              </div>
            )}
          </dl>
          <Link href="/partner/checkliste" className="ct-link mt-3 inline-block">
            {t.partner.checklistOpen}
          </Link>
        </Card>

        <Card>
          <h2 className="ct-h3 text-ink">{t.partner.deadlinesTitle}</h2>
          {upcoming.length === 0 ? (
            <p className="ct-help mt-1">{t.partner.deadlinesNone}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {upcoming.map((d) => (
                <li key={d.key} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="ct-label text-ink">{deadlineLabel(d)}</span>
                  <span className="ct-help tabular-nums">
                    {dateTime.format(new Date(d.due_at!))}
                    <Countdown
                      dueAt={d.due_at!}
                      days={t.partner.countdownDays}
                      hours={t.partner.countdownHours}
                      soon={t.partner.countdownSoon}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="ct-h3 text-ink">{t.partner.productsTitle}</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {o.products.map((p) => (
              <li key={p.sku} className="flex flex-wrap items-baseline gap-2">
                <span className="ct-label text-ink">{productName(p)}</span>
                {p.qty > 1 && <span className="ct-help tabular-nums">× {p.qty}</span>}
                {p.category && <Badge>{categories[p.category] ?? p.category}</Badge>}
              </li>
            ))}
          </ul>
          <p className="ct-help mt-3">{t.partner.productsHint}</p>
        </Card>

        <Card>
          <h2 className="ct-h3 text-ink">{t.partner.supportTitle}</h2>
          <p className="ct-help mt-1">{t.partner.supportBody}</p>
          <a className="ct-link mt-2 inline-block" href={`mailto:${PARTNER_MAILBOX}`}>
            {PARTNER_MAILBOX}
          </a>
        </Card>
      </div>
    </>
  );
}
