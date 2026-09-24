import { Badge } from "@/components/ui/Badge";
import { neuesFenster } from "@/components/ui/neues-fenster";
import type { FormatDetails } from "./types";

type Strings = Record<string, string>;

/**
 * Die Format-Details im Drawer (TAL-002/003): für Masterclass, Company Tour,
 * Side-Event und Interview Table **derselbe Aufbau** — Gastgeber, Ort, Bild,
 * gesuchte Profile, Stelle, Tour-Stopps, Hinweise. Was ein Format nicht hat,
 * fällt weg; die Reihenfolge bleibt.
 */
export function FormatDetailsBlock({
  d,
  dateLocale,
  timeZone,
  t,
}: {
  d: FormatDetails;
  dateLocale: string;
  timeZone: string;
  t: Strings;
}) {
  const zeit = new Intl.DateTimeFormat(dateLocale, { hour: "2-digit", minute: "2-digit", timeZone });
  const spanne = (a: string | null, b: string | null) =>
    a ? `${zeit.format(new Date(a))}${b ? `–${zeit.format(new Date(b))}` : ""}` : null;

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      {d.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- signierte, kurzlebige Adresse; kein Loader-Ziel
        <img src={d.imageUrl} alt="" className="aspect-video w-full rounded-ct-md object-cover" />
      )}
      <dl className="grid gap-2 ct-small sm:grid-cols-[max-content_1fr] sm:gap-x-4">
        {d.hostName && (
          <>
            <dt className="text-muted">{t.detailHost}</dt>
            <dd className="text-ink">{d.hostName}</dd>
          </>
        )}
        {d.location && (
          <>
            <dt className="text-muted">{d.tour ? t.detailMeetingPoint : t.detailLocation}</dt>
            <dd className="text-ink">{d.location}</dd>
          </>
        )}
        {d.tour && spanne(d.tour.startsAt, d.tour.endsAt) && (
          <>
            <dt className="text-muted">{t.detailTourTime}</dt>
            <dd className="tabular-nums text-ink">{spanne(d.tour.startsAt, d.tour.endsAt)}</dd>
          </>
        )}
        {d.jobTitle && (
          <>
            <dt className="text-muted">{t.detailJob}</dt>
            <dd className="text-ink">
              {d.jobTitle}
              {d.jobPostingUrl && (
                <>
                  {" · "}
                  <a href={d.jobPostingUrl} {...neuesFenster} className="ct-link">
                    {t.detailJobLink}
                  </a>
                </>
              )}
            </dd>
          </>
        )}
        {d.interviewMode && (
          <>
            <dt className="text-muted">{t.detailInterviewMode}</dt>
            <dd className="text-ink">{d.interviewMode === "group" ? t.detailInterviewGroup : t.detailInterviewSingle}</dd>
          </>
        )}
      </dl>

      {d.jobPostingText && <p className="ct-small whitespace-pre-line text-ink">{d.jobPostingText}</p>}

      {d.targetProfile.length > 0 && (
        <div>
          <p className="ct-label mb-1 text-ink">{t.detailTarget}</p>
          <div className="flex flex-wrap gap-2">
            {d.targetProfile.map((l) => (
              <Badge key={l}>{l}</Badge>
            ))}
          </div>
        </div>
      )}

      {d.tour && d.tour.stops.length > 0 && (
        <div>
          <p className="ct-label mb-1 text-ink">{t.detailStops}</p>
          <ol className="flex flex-col gap-2">
            {d.tour.stops.map((st, i) => (
              <li key={i} className="rounded-ct-md border p-3 ct-small">
                <p className="text-ink">
                  {i + 1}. {st.hostName ?? t.detailStopTbd}
                  {spanne(st.arrivalAt, st.departureAt) && (
                    <span className="tabular-nums text-muted"> · {spanne(st.arrivalAt, st.departureAt)}</span>
                  )}
                </p>
                {st.address && <p className="text-muted">{st.address}</p>}
                {st.notes && <p className="mt-1 whitespace-pre-line text-ink">{st.notes}</p>}
                {st.targetProfile.length > 0 && (
                  <p className="mt-1 text-muted">
                    {t.detailTarget}: {st.targetProfile.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
