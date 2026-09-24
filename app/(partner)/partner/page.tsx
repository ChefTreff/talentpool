import type { ReactNode } from "react";
import Link from "next/link";
import { getSessionContext, requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { HeroBand, BandStat } from "@/components/ui/HeroBand";
import { PhotoCard } from "@/components/ui/PhotoCard";
import { DateRow, DateList } from "@/components/ui/DateRow";
import { InfoList, type InfoEintrag } from "@/components/ui/InfoList";
import { Ansprechpartner } from "@/components/kontakt/Ansprechpartner";
import { loadEditionInfos, loadMyContacts } from "@/components/kontakt/load";
import { Anfahrt } from "@/components/kontakt/Anfahrt";
import { OnboardingNudge } from "./OnboardingNudge";
import { visibleNavKeys } from "./nav";
import { getPartnerScope } from "./org";
import { canEditOnboarding, orgLabel, type PartnerOverview } from "./types";

export const dynamic = "force-dynamic";

const PARTNER_MAILBOX = "partner@chef-treff.de";

/**
 * Die nächsten vier Fristen, überfällige zuerst — sie sind der Grund, aus dem
 * man diese Seite morgens öffnet.
 *
 * Ausserhalb der Komponente, weil `Date.now()` im Rumpf einer Komponente
 * unrein ist (`react-hooks/purity`): das Ergebnis hängt vom Zeitpunkt des
 * Renderns ab. Die Seite ist `force-dynamic`, rendert also je Aufruf neu —
 * hier ist der Zeitbezug gewollt und steht deshalb an einer Stelle, an der
 * man ihn sieht.
 */
function fristenAuswahl(deadlines: PartnerOverview["deadlines"]) {
  const jetzt = Date.now();
  const mitFrist = deadlines.filter((d) => d.due_at);
  const ueberfaellig = mitFrist
    .filter((d) => new Date(d.due_at!).getTime() <= jetzt)
    .sort((a, b) => b.due_at!.localeCompare(a.due_at!));
  const kommend = mitFrist
    .filter((d) => new Date(d.due_at!).getTime() > jetzt)
    .sort((a, b) => a.due_at!.localeCompare(b.due_at!));
  return {
    fristen: [...ueberfaellig, ...kommend].slice(0, 4),
    naechste: kommend[0] ?? null,
    jetzt,
  };
}

/**
 * Die Startseite des Partner-Bereichs — **Archetyp D · Übersicht**
 * (`referenzen/muster.md`).
 *
 * Sie beantwortet vier Fragen in dieser Reihenfolge: wo bin ich, was ist zu
 * tun, wie steht es, wen frage ich. Deshalb das `HeroBand` oben (wo, und mit
 * seiner einen Aktion auch: was), darunter die drei Einstiege, dann die
 * Kennzahlen (wie), dann Fristen und Ansprechpartner (wen).
 *
 * **Seit QS-037 nach dem Vorbild der Talent-Startseite** (Konrad, 24.09.):
 * Gruss mit einem Highlight-Wort, der nächste Schritt als einzige Aktion im
 * Band, drei Einstiege mit Bildfläche. Der nächste Schritt stand vorher in
 * einem eigenen `NextStepBanner` unter dem Band — zwei Akzentflächen mit
 * zwei Aktionen übereinander, und das Band hatte keine. Jetzt sagt das Band
 * im Satz, wie es steht, und führt mit dem Knopf dorthin.
 *
 * Der Name der Organisation steht in der Zeile über dem Gruss, nicht als
 * Titel: ein Firmenname mit einem eingefärbten Wort darin wäre Unfug, und
 * begrüsst wird die Person, die hier arbeitet.
 */
export default async function PartnerDashboard() {
  await requireArea("partner", "/partner");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();

  // Rolle `partner_contact` ohne Mitgliedschaft: der Bereich steht offen, es
  // gibt nur nichts zu zeigen. Das ist kein Fehler, sondern ein Zustand.
  if (!current) {
    return (
      <>
        <PageHeader word={t.partner.wordPartnership} title={t.partner.title} description={t.partner.lead} />
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
  const [{ data: overviewJson }, vocab, kontakte, infos] = await Promise.all([
    supabase.rpc("partner_overview", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    loadVocabMap(supabase, locale),
    loadMyContacts(current.edition_id),
    loadEditionInfos("partner", current.edition_id),
  ]);
  const o = (overviewJson ?? null) as PartnerOverview | null;

  if (!o) {
    return (
      <>
        <PageHeader word={t.partner.wordPartnership} title={t.partner.title} description={t.partner.lead} />
        <EmptyState title={t.partner.noOrgTitle} description={t.partner.noOrgBody} />
      </>
    );
  }

  const categories = vgroup(vocab, "product_category");
  const kurzDatum = new Intl.DateTimeFormat(t.meta.dateLocale, {
    day: "numeric",
    month: "short",
  });
  const productName = (p: { name_de: string | null; name_en: string | null }) =>
    (locale === "en" ? p.name_en : p.name_de) ?? p.name_de ?? p.name_en ?? "—";
  const deadlineLabel = (d: { label_de: string | null; label_en: string | null; key: string }) =>
    (locale === "en" ? d.label_en : d.label_de) ?? d.label_de ?? d.key;

  const zeiten: InfoEintrag[] = infos
    .map((i) => ({
      key: i.key,
      label: (locale === "en" ? i.label_en : i.label_de) ?? i.label_de ?? i.label_en ?? i.key,
      value: (locale === "en" ? i.value_en : i.value_de) ?? i.value_de ?? i.value_en ?? "",
    }))
    .filter((i) => i.value !== "");

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
  const onboardingOffen = status !== "filled" && status !== "call_done";
  const darfOnboarding = canEditOnboarding(o.roles, o.team);

  const { fristen, naechste, jetzt } = fristenAuswahl(o.deadlines);
  /**
   * Das Lunch-Paket ist ein Angebot, kein Muss (PART-049). Der Hinweis steht
   * hier, solange seine Frist läuft — ist sie vorbei, hilft er niemandem mehr.
   * Konrad: „super wichtig, dass alle Partner das sehen."
   */
  const lunchOffen = o.deadlines.some(
    (d) => d.key === "lunch_package" && d.due_at && new Date(d.due_at) > new Date(),
  );

  // Begrüsst wird die Person, die hier arbeitet — `session_context()` kennt
  // ihren Vornamen, ohne dass die Seite eine eigene Abfrage braucht.
  const vorname = (await getSessionContext()).firstName?.trim() || null;

  // Das Band sagt im Satz, wie es steht, und führt mit **einem** Knopf zum
  // nächsten Schritt. Fehlen die Stammdaten, ist das der Schritt — die
  // Checkliste hängt daran. Ist alles erledigt, braucht es keinen Knopf: der
  // Satz ist die Nachricht.
  const band: { lead: string; action?: ReactNode } =
    onboardingOffen && darfOnboarding
      ? {
          lead: t.partner.bandOnboarding,
          action: (
            <ButtonLink href="/partner/onboarding">{t.partner.nextStepOnboardingAction}</ButtonLink>
          ),
        }
      : o.checklist.open > 0
        ? {
            lead: `${t.partner.nextStepOpen
              .replace("{open}", String(o.checklist.open))
              .replace("{total}", String(o.checklist.total))}${
              o.checklist.overdue > 0
                ? ` — ${t.partner.nextStepOverdue.replace("{overdue}", String(o.checklist.overdue))}`
                : ""
            }.`,
            action: <ButtonLink href="/partner/checkliste">{t.partner.nextStepAction}</ButtonLink>,
          }
        : { lead: o.checklist.total > 0 ? t.partner.nextStepDoneHint : t.partner.bandLead };

  // Die drei Einstiege: Tickets, wenn es welche gibt, sonst das eigene Team;
  // die Event-App gilt für jeden; der Messeshop, wenn ein Stand dazugehört,
  // sonst das Wiki.
  const sichtbar = new Set(
    visibleNavKeys({
      products: o.products,
      sessions_count: o.sessions_count,
      has_stage: o.has_stage,
      has_booth: o.booth != null,
      has_allocations: o.ticket_allocations.length > 0,
    }),
  );
  const einstiege = [
    sichtbar.has("tickets")
      ? {
          href: "/partner/tickets",
          word: t.partner.wordAccess,
          title: t.partnerTickets.title,
          body: t.partner.entryTicketsBody,
          action: t.partner.entryTicketsAction,
        }
      : {
          href: "/partner/kontakte",
          word: t.partner.wordTeam,
          title: t.partnerContacts.title,
          body: t.partner.entryTeamBody,
          action: t.partner.entryTeamAction,
        },
    {
      href: "/partner/event-app",
      word: t.partner.wordVisibility,
      title: t.partnerEventApp.title,
      body: t.partner.entryEventAppBody,
      action: t.partner.entryEventAppAction,
    },
    sichtbar.has("shop")
      ? {
          href: "/partner/shop",
          word: t.partner.wordEquipment,
          title: t.partnerShop.title,
          body: t.partner.entryShopBody,
          action: t.partner.entryShopAction,
        }
      : {
          href: "/partner/wiki",
          word: t.wiki.word,
          title: t.partner.navWiki,
          body: t.partner.entryWikiBody,
          action: t.partner.entryWikiAction,
        },
  ];

  return (
    <>
      {/* Einmal, nicht bei jedem Besuch (F12.2, korrigiert nach Konrads
          Einwand): eine Weiterleitung auf der Uebersicht ist eine Sperre. */}
      {status === "invited" && darfOnboarding && (
        <OnboardingNudge
          orgEditionId={current.edition_id ?? current.org_id}
          title={t.partner.nudgeTitle}
          body={t.partner.nudgeBody}
          action={t.partner.nudgeAction}
          later={t.partner.nudgeLater}
          href="/partner/onboarding"
        />
      )}

      <HeroBand
        eyebrow={`${orgLabel(o.org)}${current.edition_name ? ` · ${current.edition_name}` : ""}`}
        title={vorname ? t.partner.bandGreeting.replace("{name}", vorname) : orgLabel(o.org)}
        highlight={vorname ? t.partner.bandHighlight : undefined}
        lead={band.lead}
        action={band.action}
        aside={
          <BandStat
            value={naechste ? kurzDatum.format(new Date(naechste.due_at!)) : "—"}
            label={t.partner.bandStatLabel}
            hint={naechste ? deadlineLabel(naechste) : t.partner.bandStatNone}
          />
        }
      />

      {/* Die drei Einstiege (Talent-Muster, QS-037). Welche es sind, folgt
          aus dem, was dieser Partner sieht — dieselbe Regel wie das Menü
          (`visibleNavKeys`): eine Karte zu einer Seite, die es für ihn nicht
          gibt, wäre ein Versprechen ins Leere. */}
      <div className="mb-10 grid gap-6 sm:grid-cols-3">
        {einstiege.map((e) => (
          <PhotoCard
            key={e.href}
            word={e.word}
            title={e.title}
            description={e.body}
            action={
              <ButtonLink href={e.href} variant="secondary" size="sm">
                {e.action}
              </ButtonLink>
            }
          />
        ))}
      </div>

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
        {/* Fristen als Zeilen mit Datumsspalte — überfällige zuerst und mit
            Balken. Vorher standen sie als Absatz mit Datum darin, und man
            sah nicht, was brennt (Termin-Zeile, `319:692`). */}
        <Card className="p-0">
          <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
            <h2 className="ct-h2 text-ink">{t.partner.deadlinesTitle}</h2>
            <Link href="/partner/checkliste" className="ct-link ct-small">
              {t.partner.deadlinesAll}
            </Link>
          </div>
          {fristen.length === 0 ? (
            <p className="ct-help px-4 py-6">{t.partner.deadlinesNone}</p>
          ) : (
            <DateList>
              {fristen.map((d) => {
                const spaet = new Date(d.due_at!).getTime() <= jetzt;
                return (
                  <DateRow
                    key={d.key}
                    date={kurzDatum.format(new Date(d.due_at!))}
                    note={spaet ? t.partner.deadlineOverdue : undefined}
                    overdue={spaet}
                    title={deadlineLabel(d)}
                    subtitle={
                      (locale === "en" ? d.description_en : d.description_de) ?? undefined
                    }
                  />
                );
              })}
            </DateList>
          )}
        </Card>

        <Card>
          <h2 className="ct-h2 text-ink">{t.partner.checklistTitle}</h2>
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
          {/* PART-049: Das Lunch-Paket soll jeder Partner sehen, ohne dafür in
              den Messeshop zu gehen. Es steht hier, solange es offen ist —
              danach verschwindet der Hinweis von selbst. */}
          {lunchOffen && (
            <div className="mt-4 border-t border-border pt-3">
              <h3 className="ct-label text-ink">{t.partner.lunchCardTitle}</h3>
              <p className="ct-help mt-1">{t.partner.lunchCardBody}</p>
              <Link href="/partner/checkliste" className="ct-link mt-2 inline-block">
                {t.partner.lunchCardAction}
              </Link>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="ct-h2 text-ink">{t.partner.productsTitle}</h2>
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
          <h2 className="ct-h2 text-ink">{t.partner.supportTitle}</h2>
          <p className="ct-help mt-1">{t.partner.supportBody}</p>
          <a className="ct-link mt-2 inline-block" href={`mailto:${PARTNER_MAILBOX}`}>
            {PARTNER_MAILBOX}
          </a>
        </Card>
      </div>

      {/* Was Konrad „serviceorientiert" nennt: wer zuständig ist, wann was
          los ist, wo es stattfindet. Jeder Block fällt weg, wenn nichts
          gepflegt ist — eine leere Überschrift ist schlechter als nichts. */}
      <div className="mt-8 flex flex-col gap-8">
        <Ansprechpartner
          kontakte={kontakte.filter((k) => k.via === "partner")}
          locale={locale}
          title={t.partner.contactsTitle}
          lead={t.partner.contactLead}
          buddy={t.partner.contactBuddy}
        />

        {zeiten.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="ct-h2">{t.partner.timesTitle}</h2>
            <Card>
              <InfoList items={zeiten} />
              <p className="ct-help mt-4">
                {t.partner.timesWikiHint}{" "}
                <Link className="ct-link" href="/partner/wiki">
                  {t.partner.navWiki}
                </Link>
              </p>
            </Card>
          </section>
        )}

        <Anfahrt
          title={t.partner.locationTitle}
          venue={t.common.venueName}
          address={t.common.venueAddress}
          mapsLabel={t.common.openInMaps}
          wikiHref="/partner/wiki"
          wikiLabel={t.partner.locationWikiHint}
        />
      </div>

    </>
  );
}
