"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { ordneZu, setzeTyp, tausche, touren, type Ergebnis } from "./actions";

type Stopp = { id: string; sort_order: number; arrival_at: string | null; host_org_id: string | null; host_name: string | null; filled: boolean };
type Tour = {
  id: string; name: string; tour_type: string | null; starts_at: string | null; has_day: boolean;
  lead_name: string | null; session_title: string | null; stops: Stopp[];
  stops_total: number; stops_assigned: number; stops_filled: number;
};
type Partner = { org_id: string; name: string; products: string[]; tours: string[] };
export type Uebersicht = { edition_id: string | null; tours: Tour[]; partners: Partner[] };

/** Stand einer Tour in einem Wort — die Einzelheiten stehen darunter. */
function stand(tour: Tour): { ton: BadgeTone; key: string } {
  if (tour.stops_total > 0 && tour.stops_assigned === tour.stops_total && tour.stops_filled === tour.stops_total && tour.lead_name && tour.has_day)
    return { ton: "success", key: "stateReady" };
  if (tour.stops_assigned > 0) return { ton: "accent", key: "statePartial" };
  return { ton: "warning", key: "stateOpen" };
}

/**
 * Touren als Spalten, je Stopp der Partner (ADM-045). Zuordnen über die Auswahl
 * am Stopp; Tauschen in zwei Klicks: erst „Tauschen" am einen Stopp, dann
 * „hierher tauschen" am anderen. Die Angaben, die ein Partner zu seinem Stopp
 * gemacht hat, gehen mit ihm — getauscht werden die Plätze.
 */
export function ZuordnungView({
  daten,
  typen,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  daten: Uebersicht;
  typen: { value: string; label: string }[];
  dateLocale: string;
  t: Record<string, string>;
  common: { none: string; cancel: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [quelle, setQuelle] = useState<Stopp | null>(null);
  const zeit = new Intl.DateTimeFormat(dateLocale, { hour: "2-digit", minute: "2-digit" });
  const ohneTour = daten.partners.filter((p) => p.tours.length === 0);
  const typLabel = Object.fromEntries(typen.map((x) => [x.value, x.label]));

  const fuehreAus = (aufruf: () => Promise<Ergebnis>, erfolg: (n?: number) => string) =>
    start(async () => {
      const r = await aufruf();
      if (!r.ok) { toast("error", rpcMessages[r.key] ?? rpcMessages.unknown ?? r.key); return; }
      toast("success", erfolg(r.n));
      setQuelle(null);
      router.refresh();
    });

  const optionenFuer = (s: Stopp) => {
    const liste = daten.partners.map((p) => ({ value: p.org_id, label: p.name }));
    if (s.host_org_id && !liste.some((o) => o.value === s.host_org_id)) {
      liste.unshift({ value: s.host_org_id, label: s.host_name ?? s.host_org_id });
    }
    return [{ value: "", label: common.none }, ...liste];
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={pending} onClick={() => fuehreAus(touren, (n) => t.ensureDone.replace("{n}", String(n ?? 0)))}>
          {t.ensure}
        </Button>
        <ButtonLink href="/admin/company-tours" variant="ghost">{t.editTours}</ButtonLink>
        {quelle && (
          <span className="ct-small" role="status">
            {t.swapHint.replace("{name}", quelle.host_name ?? t.emptyStop)}{" "}
            <Button size="sm" variant="ghost" onClick={() => setQuelle(null)}>{common.cancel}</Button>
          </span>
        )}
      </div>

      <Card>
        <CardHeader ebene="h2" title={t.bookedTitle} description={t.bookedLead.replace("{n}", String(daten.partners.length)).replace("{ohne}", String(ohneTour.length))} />
        {daten.partners.length === 0 ? (
          <p className="ct-small text-muted">{t.bookedEmpty}</p>
        ) : (
          <ul className="ct-small flex flex-col gap-2">
            {daten.partners.map((p) => (
              <li key={p.org_id} className="flex flex-wrap items-center gap-2">
                <span className="ct-label">{p.name}</span>
                <span className="text-muted">{p.products.join(", ")}</span>
                {p.tours.length === 0 ? (
                  <Badge tone="warning">{t.noTour}</Badge>
                ) : (
                  p.tours.map((n) => <Badge key={n}>{n}</Badge>)
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {daten.tours.length === 0 ? (
        <p className="ct-small text-muted">{t.toursEmpty}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {daten.tours.map((tour) => {
            const s = stand(tour);
            return (
              <Card key={tour.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="ct-h3">{tour.name}</h2>
                    <p className="ct-help text-muted">
                      {[tour.starts_at ? zeit.format(new Date(tour.starts_at)) : null, tour.lead_name ?? t.noLead, tour.session_title]
                        .filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Badge tone={s.ton}>{t[s.key]}</Badge>
                </div>
                <p className="ct-help mt-1">
                  {t.counts
                    .replace("{besetzt}", String(tour.stops_assigned))
                    .replace("{gesamt}", String(tour.stops_total))
                    .replace("{ausgefuellt}", String(tour.stops_filled))}
                  {!tour.has_day && ` · ${t.noDay}`}
                </p>
                <label className="mt-3 flex flex-col gap-1">
                  <span className="ct-label">{t.type}</span>
                  <Select
                    disabled={pending}
                    value={tour.tour_type ?? ""}
                    options={[{ value: "", label: common.none }, ...typen]}
                    onChange={(e) => fuehreAus(() => setzeTyp(tour.id, e.target.value), () => t.typeSaved)}
                  />
                </label>
                <ol className="mt-4 flex flex-col gap-3">
                  {tour.stops.map((st) => (
                    <li key={st.id} className="flex flex-col gap-2 rounded-ct-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="ct-label">
                          {t.stop.replace("{n}", String(st.sort_order))}
                          {st.arrival_at && ` · ${zeit.format(new Date(st.arrival_at))}`}
                        </span>
                        {st.host_org_id && (
                          <Badge tone={st.filled ? "success" : "neutral"}>{st.filled ? t.filled : t.notFilled}</Badge>
                        )}
                      </div>
                      <Select
                        aria-label={t.partnerFor.replace("{tour}", tour.name).replace("{n}", String(st.sort_order))}
                        disabled={pending}
                        value={st.host_org_id ?? ""}
                        options={optionenFuer(st)}
                        onChange={(e) => fuehreAus(() => ordneZu(st.id, e.target.value), () => t.assigned)}
                      />
                      <div>
                        {quelle?.id === st.id ? (
                          <span className="ct-help">{t.swapSource}</span>
                        ) : quelle ? (
                          <Button size="sm" variant="secondary" disabled={pending}
                            onClick={() => fuehreAus(() => tausche(quelle.id, st.id), () => t.swapped)}>
                            {t.swapHere}
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setQuelle(st)}>
                            {t.swap}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
                {tour.tour_type && typLabel[tour.tour_type] && typLabel[tour.tour_type] !== tour.name && (
                  <p className="ct-help mt-2 text-muted">{t.typeLabel.replace("{typ}", typLabel[tour.tour_type])}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
