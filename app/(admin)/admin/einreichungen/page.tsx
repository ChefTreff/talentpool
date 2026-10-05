import { requireAnyAdminSection } from "@/lib/auth";
import { mayEnterAdminSection } from "@/lib/admin-access";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { FREIGABE_ARTEN, summeOffen, waehleArt, type FreigabeArt, type FreigabeZaehler } from "@/lib/freigaben";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubmissionQueue, type PendingSubmission } from "@/components/einreichungen/SubmissionQueue";
import { FreigabeListe } from "@/components/programme/FreigabeListe";
import { loadSlotFreigaben } from "@/components/programme/loadFreigabe";
import { ShuttleAdmin } from "../hospitality/ShuttleAdmin";
import type { AdminQuota } from "../hospitality/HospitalityAdmin";
import { ExpenseQueue, type QueueClaim } from "../reisekosten/ExpenseQueue";
import { HotelFreigabe, type OffeneBuchung } from "./HotelFreigabe";
import type { ShuttleAdminRow } from "@/components/shuttle/types";
import type { ManagerScope } from "@/app/(speaker-leads)/speaker-leads/types";

export const dynamic = "force-dynamic";

const PATH = "/admin/einreichungen";

/** Welcher Admin-Abschnitt entscheidet über welche Art — jede Art hat ihre eigene Rechteprüfung. */
const ABSCHNITT: Record<FreigabeArt, "submissions" | "programme" | "expenses" | "hospitality"> = {
  inhalte: "submissions",
  slots: "programme",
  reisekosten: "expenses",
  hotel: "hospitality",
  shuttle: "hospitality",
};

/**
 * Die zentrale Freigabe-Übersicht (ADM-072, Paulina 05.10.: „alles Freigabepflichtige
 * an einem Ort“): Titel und Beschreibungen, Slots zur Veröffentlichung, Reisekosten,
 * Hotel und Shuttle — je Art ein Reiter mit Zähler, Freigeben und Ablehnen direkt
 * dort. Die Einzelbereiche (Reisekosten, Hotels, Programm) behalten Lesen und
 * Verlauf; die Aktionen wohnen nur hier (Admin-Vollständigkeit andersherum).
 *
 * Jede Art wird nur gezeigt und gezählt, wenn die Person den zugehörigen Abschnitt
 * betreten darf — und die Datenbank prüft bei jeder Aktion noch einmal.
 */
export default async function FreigabenPage({ searchParams }: { searchParams: Promise<{ art?: string }> }) {
  const { roleNames } = await requireAnyAdminSection(["submissions", "programme", "expenses", "hospitality"], PATH);
  const { locale, t } = await getI18n();
  const { art: artParam } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const ta = t.adminApprovals;

  const darf = Object.fromEntries(
    await Promise.all(
      FREIGABE_ARTEN.map(async (a) => [a, await mayEnterAdminSection(ABSCHNITT[a], roleNames)] as const),
    ),
  ) as Record<FreigabeArt, boolean>;

  // Alles, was eine erlaubte Art braucht, in einem Durchgang laden. `null` heisst: die
  // Datenbank hat die Person abgewiesen — die Art verschwindet, statt eine Fehlerseite zu zeigen.
  const [scopeAntwort, inhalte, slots, reisekosten, hotelQuoten, shuttle, vocab] = await Promise.all([
    darf.inhalte ? supabase.rpc("my_manager_scope") : null,
    darf.inhalte ? supabase.rpc("pending_submissions") : null,
    darf.slots ? loadSlotFreigaben(roleNames) : null,
    darf.reisekosten ? supabase.rpc("expense_queue") : null,
    darf.hotel ? supabase.rpc("hospitality_admin_overview") : null,
    darf.shuttle ? supabase.rpc("shuttle_bookings_admin") : null,
    loadVocabMap(supabase, locale),
  ]);

  const scope = (scopeAntwort?.data ?? null) as ManagerScope | null;
  const einreichungen = inhalte && !inhalte.error && scope?.is_manager ? ((inhalte.data ?? []) as PendingSubmission[]) : null;
  const slotListen = slots;
  const claims = reisekosten && !reisekosten.error ? ((reisekosten.data ?? []) as QueueClaim[]) : null;
  const offeneClaims = (claims ?? []).filter((c) => c.status === "submitted");
  const quoten = hotelQuoten && !hotelQuoten.error ? ((hotelQuoten.data ?? []) as AdminQuota[]) : null;
  const offeneBuchungen: OffeneBuchung[] = (quoten ?? []).flatMap((q) =>
    (q.bookings ?? [])
      .filter((b) => b.status === "requested" || b.status === "waitlisted")
      .map((b) => ({
        ...b,
        quota: {
          quota_id: q.quota_id,
          kind: q.kind,
          tier: q.tier,
          label_de: q.label_de,
          label_en: q.label_en,
          location: q.location,
        },
      })),
  );
  const fahrten = shuttle && !shuttle.error ? ((shuttle.data ?? []) as ShuttleAdminRow[]) : null;
  const offeneFahrten = (fahrten ?? []).filter((r) => r.status === "requested");

  const zaehler: FreigabeZaehler = {};
  if (einreichungen) zaehler.inhalte = einreichungen.length;
  if (slotListen) zaehler.slots = slotListen.partner.length + slotListen.buehnen.length;
  if (claims) zaehler.reisekosten = offeneClaims.length;
  if (quoten) zaehler.hotel = offeneBuchungen.length;
  if (fahrten) zaehler.shuttle = offeneFahrten.length;

  const art = waehleArt(artParam, zaehler);
  const offen = summeOffen(zaehler);

  const reiter = FREIGABE_ARTEN.filter((a) => zaehler[a] !== undefined).map((a) => ({
    href: `${PATH}?art=${a}`,
    label: `${ta[`tab_${a}`]} (${zaehler[a]})`,
    aktiv: a === art,
  }));

  return (
    <>
      <PageHeader
        word={t.admin.words.submissions}
        title={ta.title}
        description={`${ta.lead} · ${offen} ${ta.openCount}`}
      />
      {art === null ? (
        <EmptyState title={ta.noAccessTitle} description={ta.noAccessBody} />
      ) : (
        <>
          <SectionTabs label={ta.tabsLabel} items={reiter} />
          {art === "inhalte" &&
            (einreichungen && einreichungen.length > 0 ? (
              <SubmissionQueue
                submissions={einreichungen}
                languages={vgroup(vocab, "language")}
                publishStatus={vgroup(vocab, "publish_status")}
                dateLocale={t.meta.dateLocale}
                t={t.leadSubmissions}
                common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
                rpcMessages={t.rpc}
              />
            ) : (
              <EmptyState title={ta.emptyTitle} description={ta.emptyBody} />
            ))}
          {art === "slots" &&
            slotListen &&
            (slotListen.keinEvent ? (
              <EmptyState title={t.admin.programme.noEventTitle} description={t.admin.programme.noEventBody} />
            ) : (
              <FreigabeListe
                partner={slotListen.partner}
                buehnen={slotListen.buehnen}
                canRelease={slotListen.canRelease}
                formatLabels={slotListen.formatLabels}
                t={t.admin.programmeRelease}
                rpcMessages={t.rpc}
              />
            ))}
          {art === "reisekosten" &&
            (offeneClaims.length > 0 ? (
              <ExpenseQueue
                modus="freigabe"
                claims={offeneClaims}
                categories={vgroup(vocab, "expense_category")}
                dateLocale={t.meta.dateLocale}
                t={t.admin.expenses}
                common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
                rpcMessages={t.rpc}
              />
            ) : (
              <EmptyState title={ta.emptyTitle} description={ta.emptyBody} />
            ))}
          {art === "hotel" &&
            (offeneBuchungen.length > 0 ? (
              <HotelFreigabe
                buchungen={offeneBuchungen}
                locale={locale}
                dateLocale={t.meta.dateLocale}
                t={t.admin.hospitality}
                // Die Feldnamen der Buchung stehen schon im Speaker-Portal; dieselbe
                // Buchung soll im Admin nicht anders heißen.
                detailLabels={t.speaker as unknown as Record<string, string>}
                common={{ none: t.common.none }}
                rpcMessages={t.rpc}
              />
            ) : (
              <EmptyState title={ta.emptyTitle} description={ta.emptyBody} />
            ))}
          {art === "shuttle" &&
            (offeneFahrten.length > 0 ? (
              <ShuttleAdmin
                modus="freigabe"
                rows={offeneFahrten}
                dateLocale={t.meta.dateLocale}
                t={t.admin.hospitality}
                common={{ cancel: t.common.cancel }}
                rpcMessages={t.rpc}
              />
            ) : (
              <EmptyState title={ta.emptyTitle} description={ta.emptyBody} />
            ))}
        </>
      )}
    </>
  );
}
