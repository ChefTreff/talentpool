import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminSection } from "@/lib/auth";
import { getDictionary, getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MeetUsAt } from "@/components/partner/MeetUsAt";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

/** Zeile aus `partner_graphics_admin` — hier nur, um die Organisation der Edition zu finden. */
type Zeile = { org_id: string; org_name: string | null };

/**
 * „Meet us at“-Grafik für einen Partner erzeugen und als Partnergrafik ablegen
 * (PART-097, der Admin-Weg zu PART-096).
 *
 * Dieselbe Komponente wie im Partner-Portal (`MeetUsAt`), dazu „Als Partnergrafik
 * ablegen“: die Grafik wird eine neue Version der Partnergrafik der Organisation
 * und steht dem Partner unter „Media Kit“ zum Download bereit. Der Upload ist der
 * bestehende (`/api/admin/partnergrafik`, `set_partner_graphic`).
 *
 * **Ohne neues Recht** (Plan, 04.10.2026): die Seite liest nichts von den
 * Partnerdaten außer dem Namen aus `partner_graphics_admin`, das das Marketing
 * ohnehin sieht. Weder das Logo noch die Kontakte werden geladen — das Marketing
 * wählt das Logo und das Porträt selbst; eine Lesefunktion auf Partnerdaten für
 * diese Rolle gäbe es nur mit eigener Migration (Kontakte und Bestellungen aller
 * Partner stünden dann offen).
 *
 * Wie `/admin/grafiken` gehört die Seite zur neuesten Edition.
 */
export default async function AdminMeetUsAtPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  await requireAdminSection("graphics", "/admin/grafiken");
  const { org } = await searchParams;
  const { locale, t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const { data: editionen } = await supabase
    .from("event")
    .select("id,start_date,end_date")
    .eq("is_edition", true)
    .order("start_date", { ascending: false })
    .limit(1);
  const edition = editionen?.[0] as { id: string; start_date: string | null; end_date: string | null } | undefined;
  if (!edition || !org) notFound();

  const { data: zeilen } = await supabase.rpc("partner_graphics_admin", { p_edition_id: edition.id });
  const partner = ((zeilen ?? []) as Zeile[]).find((z) => z.org_id === org);
  if (!partner) notFound();
  const name = partner.org_name ?? "—";

  const a = t.adminMeetUs;
  return (
    <>
      <PageHeader word={t.admin.words.graphics} title={a.title} description={a.lead.replace("{org}", name)} />
      <p className="mb-6">
        <Link href="/admin/grafiken" className="ct-link">
          {a.back}
        </Link>
      </p>
      <MeetUsAt
        // Je Organisation ein eigener Zustand.
        key={partner.org_id}
        orgName={name}
        logo={null}
        kontakte={[]}
        edition={{ start: edition.start_date, ende: edition.end_date }}
        portalSprache={locale === "en" ? "en" : "de"}
        // Die Wortlaute des Partner-Portals, wo nötig durch die des Admins ersetzt (kein Logo vorhanden, Ablegen).
        t={{ ...t.partnerMeetUs, ...a }}
        texte={{ de: getDictionary("de").meetUsAtGrafik, en: getDictionary("en").meetUsAtGrafik }}
        ablegen={{ orgId: partner.org_id, editionId: edition.id, zurueck: "/admin/grafiken" }}
      />
    </>
  );
}
