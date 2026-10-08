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
import { InfoList, type InfoEintrag } from "@/components/ui/InfoList";
import { Fortschritt } from "@/components/ui/Fortschritt";
import { Ansprechpartner } from "@/components/kontakt/Ansprechpartner";
import { loadEditionInfos, loadMyContacts } from "@/components/kontakt/load";
import { Anfahrt } from "@/components/kontakt/Anfahrt";
import { RUNDGANG_SCHLUESSEL, rundgangAus } from "@/components/partner/rundgang-adresse";
import { naechsteFrist, naechsteZeilen, ordneFristen } from "@/components/partner/fristen-aufgaben";
import { loadPortalLink } from "@/lib/portal-link/load";
import { loadFristVorlagen } from "@/lib/partner/vorlagen";
import { OnboardingNudge } from "./OnboardingNudge";
import { visibleNavKeys } from "./nav";
import { getPartnerScope } from "./org";
import { ChecklistView } from "./checkliste/ChecklistView";
import { canEditOnboarding, orgLabel, type Deliverable, type PartnerOverview } from "./types";

export const dynamic = "force-dynamic";

const PARTNER_MAILBOX = "partner@chef-treff.de";

/** So viele Zeilen zeigt die Übersicht; die ganze Liste steht auf der Checkliste. */
const ZEILEN_UEBERSICHT = 6;

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
  const [{ data: overviewJson }, { data: deliverableRows }, vorlagen, vocab, kontakte, infos, tourLink] = await Promise.all([
    supabase.rpc("partner_overview", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    // PART-056: die nächsten Aufgaben stehen hier schon, abhakbar.
    supabase.rpc("my_deliverables", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    // PART-099: welche Aufgabe an welcher Frist der Edition hängt.
    loadFristVorlagen(supabase),
    loadVocabMap(supabase, locale),
    loadMyContacts(current.edition_id),
    loadEditionInfos("partner", current.edition_id),
    // PART-093: der 3D-Rundgang aus Admin → Medien → Links; ohne Eintrag fehlt der Kasten.
    loadPortalLink(RUNDGANG_SCHLUESSEL, "partner", current.edition_id),
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
  // PART-099: Aufgaben und Fristen sind eine Liste. Jede Aufgabe trägt ihre Frist, eine Frist ohne
  // Aufgabe dieses Partners steht als eigene Zeile da, und das Band nennt die nächste Frist aus
  // derselben Liste. `new Date().getTime()` statt `Date.now()`: der Zeitbezug einer `force-dynamic`-
  // Seite ist gewollt (Regel `react-hooks/purity`, wie auf Tickets und Messestand).
  const jetzt = new Date().getTime();
  const aufgaben = (deliverableRows ?? []) as Deliverable[];
  const zuordnung = ordneFristen(aufgaben, o.deadlines, vorlagen);
  const zeilen = naechsteZeilen(aufgaben, zuordnung.ohneAufgabe, jetzt, ZEILEN_UEBERSICHT);
  const naechste = naechsteFrist(aufgaben, zuordnung, jetzt, locale);
  const productName = (p: { name_de: string | null; name_en: string | null }) =>
    (locale === "en" ? p.name_en : p.name_de) ?? p.name_de ?? p.name_en ?? "—";

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

  /**
   * Das Lunch-Paket ist ein Angebot, kein Muss (PART-049). Der Hinweis steht
   * hier, solange seine Frist läuft — ist sie vorbei, hilft er niemandem mehr.
   * Konrad: „super wichtig, dass alle Partner das sehen."
   */
  const lunchOffen = o.deadlines.some(
    (d) => d.key === "lunch_package" && d.due_at && new Date(d.due_at) > new Date(),
  );
  const lunchInListe = zeilen.some((z) => z.art === "aufgabe" && z.aufgabe.key === "lunch_package");

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
      has_stage: o.has_stage,
      has_booth: o.booth != null,
      has_allocations: o.ticket_allocations.length > 0,
    }),
  );
  // PART-098 (Konrad 05.10.): die Karte trägt den **Namen des Bereichs** als Überschrift — Tickets,
  // Event-App, Messeshop — und keine zweite darunter. Vorher stand ein Stichwort darüber („Zugang“,
  // „Sichtbarkeit“, „Ausstattung“) und der Name des Bereichs noch einmal darunter.
  const einstiege = [
    sichtbar.has("tickets")
      ? {
          href: "/partner/tickets",
          name: t.partnerTickets.title,
          body: t.partner.entryTicketsBody,
          action: t.partner.entryTicketsAction,
        }
      : {
          href: "/partner/kontakte",
          name: t.partnerContacts.title,
          body: t.partner.entryTeamBody,
          action: t.partner.entryTeamAction,
        },
    {
      href: "/partner/event-app",
      name: t.partnerEventApp.title,
      body: t.partner.entryEventAppBody,
      action: t.partner.entryEventAppAction,
    },
    sichtbar.has("shop")
      ? {
          href: "/partner/shop",
          name: t.partnerShop.title,
          body: t.partner.entryShopBody,
          action: t.partner.entryShopAction,
        }
      : {
          href: "/partner/wiki",
          name: t.partner.navWiki,
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
            value={naechste ? kurzDatum.format(new Date(naechste.dueAt)) : "—"}
            label={t.partner.bandStatLabel}
            hint={naechste ? naechste.titel : t.partner.bandStatNone}
          />
        }
      />

      {/* Die drei Einstiege (Talent-Muster, QS-037). Welche es sind, folgt
          aus dem, was dieser Partner sieht — dieselbe Regel wie das Menü
          (`visibleNavKeys`): eine Karte zu einer Seite, die es für ihn nicht
          gibt, wäre ein Versprechen ins Leere. Die Knöpfe stehen auf einer
          Linie, auch bei verschieden langen Texten (PART-098, `PhotoCard`). */}
      <div className="mb-10 grid gap-6 sm:grid-cols-3">
        {einstiege.map((e) => (
          <PhotoCard
            key={e.href}
            word={e.name}
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

      {/* PART-056/099: die nächsten Aufgaben — dieselbe Liste wie auf der Checkliste, also gleich hier
          abhakbar. Die Fristen sind die Fristen dieser Aufgaben und stehen an ihnen; eine Frist, an der
          keine Aufgabe dieses Partners hängt, reiht sich als Zeile ein. Es gibt keine zweite Liste
          „Fristen“ mehr, und „Ganze Checkliste“ führt zu allem. */}
      <section aria-labelledby="aufgaben-fristen" className="mb-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="aufgaben-fristen" className="ct-h2 text-ink">
            {t.partner.nextTasksTitle}
          </h2>
          {/* Der Stand als gemeinsamer Balken mit Zahl (QS-038), rechts im Kopf
              des Abschnitts; die überfälligen stehen als Wort dahinter. */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 sm:w-80">
            <Fortschritt
              className="min-w-0 flex-1"
              wert={o.checklist.done}
              gesamt={o.checklist.total}
              label={t.partner.checklistDone
                .replace("{done}", String(o.checklist.done))
                .replace("{total}", String(o.checklist.total))}
            />
            {o.checklist.overdue > 0 && (
              <span className="ct-help tabular-nums text-error-ink">
                {o.checklist.overdue} {t.partner.statOverdue}
              </span>
            )}
          </div>
        </div>
        {zeilen.length === 0 ? (
          <Card>
            <p className="ct-help">
              {o.checklist.total > 0 ? t.partner.nextTasksNone : t.partnerChecklist.emptyBody}
            </p>
          </Card>
        ) : (
          <ChecklistView
            orgId={current.org_id}
            editionId={current.edition_id}
            groups={[{ sku: null, label: t.partner.nextTasksTitle, zeilen }]}
            fristVon={zuordnung.fristVon}
            booth={o.booth}
            canEdit={darfOnboarding}
            variant="naechste"
            locale={locale}
            dateLocale={t.meta.dateLocale}
            fristTexte={{
              label: t.partnerChecklist.deadlineLabel,
              days: t.partner.countdownDays,
              hours: t.partner.countdownHours,
              soon: t.partner.countdownSoon,
              passed: t.common.deadlinePassed,
              done: t.common.deadlineDone,
            }}
            t={t.partnerChecklist}
            rpcMessages={t.rpc}
          />
        )}
        <Link href="/partner/checkliste" className="ct-link mt-3 inline-block">
          {t.partner.nextTasksAll}
        </Link>
        {/* PART-049: Das Lunch-Paket soll jeder Partner sehen, ohne dafür in
            den Messeshop zu gehen — solange es offen ist und nicht ohnehin
            unter den nächsten Aufgaben steht. */}
        {lunchOffen && !lunchInListe && (
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="ct-label text-ink">{t.partner.lunchCardTitle}</h3>
            <p className="ct-help mt-1">{t.partner.lunchCardBody}</p>
            <Link href="/partner/checkliste" className="ct-link mt-2 inline-block">
              {t.partner.lunchCardAction}
            </Link>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
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

        {/* PART-093: der Rundgang durch den Summit, nur wo es den Messestand gibt — dieselbe Regel wie das
            Menü (`sichtbar`): ein Knopf zu einer Seite, die der Partner nicht sieht, wäre ein Versprechen
            ins Leere. Der Rundgang selbst steht auf dem Messestand, hier ist nur der Weg dorthin. */}
        {sichtbar.has("booth") && rundgangAus(tourLink?.url) && (
          <Card>
            <h2 className="ct-h2 text-ink">{t.partner.tourBoxTitle}</h2>
            <p className="ct-small mt-1 max-w-text leading-6">{t.partner.tourBoxBody}</p>
            <div className="mt-3">
              <ButtonLink href="/partner/messestand#rundgang" variant="secondary" size="sm">
                {t.partner.tourBoxAction}
              </ButtonLink>
            </div>
          </Card>
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
