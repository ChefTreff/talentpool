import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/components/ui/cn";
import { PHOTO_BUCKET } from "@/lib/fotos/regeln";
import { FotoGalerie, type GalerieFoto } from "./FotoGalerie";

export const dynamic = "force-dynamic";

/** Laufzeit der Bildadressen: kurz, die Seite erzeugt sie bei jedem Aufruf neu. */
const URL_GUELTIG_SEKUNDEN = 10 * 60;

/**
 * Fotos von Events, bei denen ich war (TAL-010). Was hier steht, entscheiden
 * `my_photo_events` und `event_photos` (Teilnahme = eingecheckt, K-43) — und
 * beim Signieren die Bucket-Policy, denn signiert wird mit der eigenen Sitzung.
 */
export default async function FotosPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  await requireArea("talent", "/fotos");
  const { t } = await getI18n();
  const s = t.talentPhotos as unknown as Record<string, string>;
  const { event } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase.rpc("my_photo_events");
  const events = (data ?? []) as { event_id: string; event_name: string; photos: number }[];
  const aktiv = events.find((e) => e.event_id === event) ?? events[0] ?? null;

  let fotos: GalerieFoto[] = [];
  if (aktiv) {
    const { data: rows } = await supabase.rpc("event_photos", { p_event_id: aktiv.event_id });
    const liste = (rows ?? []) as { photo_id: string; storage_path: string; filename: string; credit: string | null; removal_requested: boolean }[];
    const pfade = liste.map((r) => r.storage_path);
    const [{ data: ansicht }, downloads] = await Promise.all([
      pfade.length ? supabase.storage.from(PHOTO_BUCKET).createSignedUrls(pfade, URL_GUELTIG_SEKUNDEN) : Promise.resolve({ data: [] }),
      Promise.all(liste.map((r) => supabase.storage.from(PHOTO_BUCKET).createSignedUrl(r.storage_path, URL_GUELTIG_SEKUNDEN, { download: r.filename }))),
    ]);
    const urls = new Map((ansicht ?? []).map((u) => [u.path ?? "", u.signedUrl ?? null]));
    fotos = liste.map((r, i) => ({
      photo_id: r.photo_id, filename: r.filename, credit: r.credit, removal_requested: r.removal_requested,
      url: urls.get(r.storage_path) ?? null, download: downloads[i]?.data?.signedUrl ?? null,
    }));
  }

  return (
    <>
      <PageHeader title={s.title} description={s.lead} />
      {events.length === 0 ? (
        <EmptyState title={s.emptyTitle} description={s.emptyBody} />
      ) : (
        <>
          {events.length > 1 && (
            <nav className="mb-4 flex flex-wrap gap-1" aria-label={s.title}>
              {events.map((e) => (
                <Link
                  key={e.event_id}
                  href={`/fotos?event=${e.event_id}`}
                  aria-current={e.event_id === aktiv?.event_id ? "page" : undefined}
                  className={cn(
                    "rounded-ct-sm px-2.5 py-1.5 ct-label transition-colors",
                    e.event_id === aktiv?.event_id ? "bg-accent-soft text-accent-deep" : "text-muted hover:bg-surface-hover hover:text-ink",
                  )}
                >
                  {e.event_name} · {e.photos}
                </Link>
              ))}
            </nav>
          )}
          <FotoGalerie fotos={fotos} t={s} rpcMessages={t.rpc} />
        </>
      )}
    </>
  );
}
