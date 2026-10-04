import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChipLink } from "@/components/ui/Chip";
import { PHOTO_BUCKET } from "@/lib/fotos/regeln";
import { FotoVerwaltung, type AdminFoto } from "./FotoVerwaltung";
import { Loeschwuensche, type Loeschwunsch } from "./Loeschwuensche";

export const dynamic = "force-dynamic";

/**
 * Event-Fotos im Admin (TAL-010, K-43: das Team lädt eine Auswahl hoch). Event
 * wählen (`?event=`), Bilder hochladen, veröffentlichen; Teilnehmende sehen
 * nur veröffentlichte Fotos von Events, bei denen sie eingecheckt waren.
 * Vorschaubilder signiert die Sitzung — die Bucket-Policy gilt auch hier.
 */
export default async function AdminFotosPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  await requireAdminSection("photos", "/admin/fotos");
  const { t } = await getI18n();
  const s = t.adminPhotos as unknown as Record<string, string>;
  const { event } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data: events }, { data: requests }] = await Promise.all([
    supabase.from("event").select("id,name,start_date,format_tag,is_edition")
      .or("is_edition.eq.true,format_tag.eq.community").lte("start_date", new Date().toISOString().slice(0, 10))
      .order("start_date", { ascending: false }).limit(30),
    supabase.rpc("photo_removal_requests_admin"),
  ]);
  const liste = (events ?? []) as { id: string; name: string; start_date: string | null }[];
  const aktiv = liste.find((e) => e.id === event) ?? liste[0] ?? null;

  let fotos: AdminFoto[] = [];
  if (aktiv) {
    const { data } = await supabase.rpc("event_photos_admin", { p_event_id: aktiv.id });
    const rows = (data ?? []) as (Omit<AdminFoto, "url"> & { storage_path: string })[];
    const { data: signed } = rows.length
      ? await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(rows.map((r) => r.storage_path), 600)
      : { data: [] };
    const urls = new Map((signed ?? []).map((u) => [u.path ?? "", u.signedUrl ?? null]));
    fotos = rows.map((r) => ({ ...r, url: urls.get(r.storage_path) ?? null }));
  }

  return (
    <>
      <PageHeader word={t.admin.words.photos} title={s.title} description={s.lead} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader ebene="h2" title={s.eventsTitle} description={s.eventsLead} />
          {liste.length === 0 ? (
            <p className="ct-help">{s.noEvents}</p>
          ) : (
            <nav className="mb-4 flex flex-wrap gap-1" aria-label={s.eventsTitle}>
              {liste.map((e) => (
                <ChipLink key={e.id} href={`/admin/fotos?event=${e.id}`} aktiv={e.id === aktiv?.id}>
                  {e.name}
                </ChipLink>
              ))}
            </nav>
          )}
          {aktiv && <FotoVerwaltung eventId={aktiv.id} fotos={fotos} t={s} />}
        </Card>
        <Card>
          <CardHeader ebene="h2" title={s.removalTitle} description={s.removalLead} />
          <Loeschwuensche rows={(requests ?? []) as Loeschwunsch[]} t={s} />
        </Card>
      </div>
    </>
  );
}
