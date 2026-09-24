import { Fragment } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PARTNER_STATUS, PARTNER_STATUS_TON, type PartnerStatus } from "@/components/partner/standbuehne";

/**
 * Kopf beider Sichten auf die Standbühne (Kalender und Tabelle): welche Bühne,
 * welches Zeitfenster an welchem Tag (PART-079), wer veröffentlicht — und in
 * der Tabelle die Legende der Partner-Status (PART-080). Im Kalender fehlt die
 * Legende, solange das Board noch den internen Slot-Status zeigt.
 */
export function StandInfo({
  eigene,
  fenster,
  t,
  legende,
  hinweisAndere,
}: {
  /** Namen der eigenen Bühnen, schon verbunden. */
  eigene: string;
  /** Fenster je Tag (bei mehreren Standbühnen je Bühne und Tag), schon formatiert. */
  fenster: { label: string; text: string }[];
  t: Record<string, string>;
  legende?: boolean;
  /** „Andere Bühnen seht ihr zur Orientierung“ — nur im Kalender, wo sie zu sehen sind. */
  hinweisAndere?: boolean;
}) {
  const statusText: Record<PartnerStatus, string> = {
    offen: t.statusOpen,
    in_bearbeitung: t.statusDraft,
    zurueckgegeben: t.statusReturned,
    zur_freigabe: t.statusReview,
    veroeffentlicht: t.statusPublished,
    abgesagt: t.statusCancelled,
  };
  const legendeText: Record<PartnerStatus, string> = {
    offen: t.legendOpen,
    in_bearbeitung: t.legendDraft,
    zurueckgegeben: t.legendReturned,
    zur_freigabe: t.legendReview,
    veroeffentlicht: t.legendPublished,
    abgesagt: t.legendCancelled,
  };

  return (
    <Card className="mb-6">
      <p className="ct-help">
        {t.ownStages}: <span className="font-semibold text-ink">{eigene}</span>
      </p>
      {fenster.length > 0 && (
        <div className="mt-3">
          <p className="ct-label text-ink">{t.windowTitle}</p>
          <p className="ct-help">{t.windowRule}</p>
          <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
            {fenster.map((f) => (
              <li key={f.label} className="ct-small text-ink">
                {f.label}: <span className="font-semibold">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {hinweisAndere && <p className="ct-help mt-3">{t.readOnlyHint}</p>}
      <p className={hinweisAndere ? "ct-help mt-1" : "ct-help mt-3"}>{t.releaseHint}</p>
      {legende && (
        <dl className="mt-4 grid items-center gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr]">
          {PARTNER_STATUS.map((s) => (
            <Fragment key={s}>
              <dt>
                <Badge tone={PARTNER_STATUS_TON[s]}>{statusText[s]}</Badge>
              </dt>
              <dd className="ct-help">{legendeText[s]}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </Card>
  );
}
