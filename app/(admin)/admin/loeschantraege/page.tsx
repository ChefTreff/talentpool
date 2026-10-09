import { requireAnyAdminSection } from "@/lib/auth";
import { mayEnterAdminSection } from "@/lib/admin-access";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { AntraegeView, type Antrag } from "./AntraegeView";
import { SperrlisteAbschnitt } from "./sperrliste/SperrlisteAbschnitt";

export const dynamic = "force-dynamic";

/**
 * Löschanträge und Sperrliste auf einer Seite (ADM-097): beides sind Datenschutz-Aufgaben — ein Antrag nach Art. 17 DSGVO
 * endet oft mit einem Eintrag in der Sperrliste. **Zwei Abschnitte, zwei Rechte:** `deletions` öffnet die Warteschlange,
 * `suppression` die Sperrliste (Vorgabe wie Ausnahmen aus ADM-053 gelten je Abschnitt). Wer nur einen darf, sieht nur ihn
 * und keine Reiter; wer keinen darf, bekommt 404.
 *
 * Die Warteschlange zeigt nur, wessen Löschung nicht von allein durchging — an der Person hängt eine Rolle, eine Zusage
 * oder eine Organisation. Wer nichts davon hat, löscht selbst und taucht hier nie auf.
 */
export default async function LoeschantraegePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ansicht?: string }>;
}) {
  const ctx = await requireAnyAdminSection(["deletions", "suppression"], "/admin/loeschantraege");
  const [darfAntraege, darfSperrliste] = await Promise.all([
    mayEnterAdminSection("deletions", ctx.roleNames),
    mayEnterAdminSection("suppression", ctx.roleNames),
  ]);
  const { t } = await getI18n("de");
  const { status, ansicht } = await searchParams;
  const aktiv: "antraege" | "sperrliste" =
    darfSperrliste && (ansicht === "sperrliste" || !darfAntraege) ? "sperrliste" : "antraege";
  const beide = darfAntraege && darfSperrliste;
  const d = t.adminDeletions as Record<string, string>;

  return (
    <div className="max-w-detail">
      <PageHeader
        word={aktiv === "sperrliste" && !beide ? t.admin.words.suppression : t.admin.words.deletions}
        title={beide ? d.pageTitle : aktiv === "sperrliste" ? (t.suppressionAdmin as Record<string, string>).title : d.title}
        description={beide ? d.pageLead : undefined}
      />
      {beide && (
        <SectionTabs
          label={d.areasLabel}
          items={[
            { href: "/admin/loeschantraege", label: d.tabRequests, aktiv: aktiv === "antraege" },
            { href: "/admin/loeschantraege?ansicht=sperrliste", label: d.tabSuppression, aktiv: aktiv === "sperrliste" },
          ]}
        />
      )}
      {aktiv === "sperrliste" ? <SperrlisteAbschnitt /> : <Warteschlange status={status} />}
    </div>
  );
}

async function Warteschlange({ status }: { status?: string }) {
  const { t } = await getI18n("de");
  const gewaehlt = status === "all" ? null : (status ?? "pending");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("deletion_requests_admin", { p_status: gewaehlt });
  return error ? (
    <EmptyState title={t.adminDeletions.noAccessTitle} description={t.adminDeletions.noAccessBody} />
  ) : (
    <>
      <p className="ct-small mb-6 max-w-prose text-muted">{t.adminDeletions.lead}</p>
      <AntraegeView
        antraege={(data ?? []) as Antrag[]}
        status={gewaehlt ?? "all"}
        dateLocale={t.meta.dateLocale}
        t={t.adminDeletions}
        blockerLabels={t.deletionBlockers}
        common={{ cancel: t.common.cancel, none: t.common.none }}
        rpcMessages={t.rpc}
      />
    </>
  );
}
