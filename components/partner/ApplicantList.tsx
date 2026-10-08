"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { useToast } from "@/components/ui/Toast";
import { BEWERBUNG_STATUS_TON, istVerdeckt, profilKurz, type ProfilWerte } from "@/components/partner/bewerbung";
import { BewerbungProfil } from "@/components/partner/BewerbungProfil";
import type { PartnerResult } from "@/app/(partner)/partner/actions";
import { APPLICATION_DECISIONS, type PartnerApplication } from "@/app/(partner)/partner/types";

type Strings = Record<string, string>;

/**
 * Bewerbungen einer Session als Liste (Kontrakt B6) — auf der Bewerberseite mit
 * Entscheidungen, auf der Company Tour nur zum Lesen (PART-046: entschieden wird
 * dort für die ganze Tour vom Team). Ohne `decide` gibt es keine Knöpfe.
 *
 * Die Antworten stehen unter ihrem Schlüssel; wer Fragetexte hat, gibt sie als
 * Schlüssel herein (die Tour liefert sie aus `partner_tour_applications`).
 *
 * Mit `wunsch` kann der Partner eines Tour-Stopps Bewerbungen als Wunsch
 * markieren (PART-092, höchstens fünf) — nur mit Einwilligung sichtbare, denn
 * wen er nicht sehen darf, kann er nicht wünschen. Die Grenze prüft die
 * Datenbank; hier ist der Knopf nur gesperrt, wenn sie erreicht ist.
 *
 * **Profil und Antworten stehen im Schubfach** (PART-122, Konrad 05.10.): die Person ist anklickbar
 * und öffnet `BewerbungProfil` — in allen Formaten gleich, auch im Reiter Teilnehmende. Die Karte
 * bleibt kurz (Name, Stand, Daten, Entscheidung); vorher standen Profil und Antworten in jeder Karte,
 * und eine Liste mit zwanzig Bewerbungen war eine Wand. Das Schubfach zeigt nur, was die Person zur
 * Weitergabe freigegeben hat; ohne Einwilligung ist sie nicht anklickbar. Das Schubfach ist die Ansicht,
 * mehr verlangt PART-122 nicht: entschieden und gewünscht wird weiter auf der Karte, es gibt keine zweite
 * Stelle dafür.
 */
export function ApplicantList({
  applications,
  statusLabels,
  profilWerte,
  decide,
  wunsch,
  dateLocale,
  t,
  rpcMessages,
}: {
  applications: PartnerApplication[];
  statusLabels: Record<string, string>;
  /** Beschriftungen der Vokabelfelder im Profil (Status, Erfahrung, Fach) — `PROFIL_VOKABULARE` je `vgroup`. */
  profilWerte?: ProfilWerte;
  /** Server-Aktion zum Entscheiden; fehlt sie, ist die Liste nur Anzeige. */
  decide?: (applicationId: string, status: string) => Promise<PartnerResult>;
  /** Wunschmarkierung (PART-092): gewünschte Bewerbungen, Obergrenze und die (gebundene) Server-Aktion. */
  wunsch?: {
    gewuenscht: string[];
    max: number;
    setzen: (applicationId: string, wish: boolean) => Promise<PartnerResult<{ count: number }>>;
  };
  dateLocale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  /** Die Bewerbung im Schubfach (PART-122). */
  const [offen, setOffen] = useState<string | null>(null);
  const imSchubfach = applications.find((a) => a.id === offen) ?? null;

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const voll = wunsch ? wunsch.gewuenscht.length >= wunsch.max : false;

  function onWunsch(a: PartnerApplication, wish: boolean) {
    if (!wunsch) return;
    setBusy(a.id);
    startTransition(async () => {
      const res = await wunsch.setzen(a.id, wish);
      setBusy(null);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", wish ? t.wishAdded : t.wishRemoved);
      router.refresh();
    });
  }
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });

  function onDecide(a: PartnerApplication, status: string) {
    if (!decide) return;
    setBusy(a.id);
    startTransition(async () => {
      const res = await decide(a.id, status);
      setBusy(null);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.decided);
      router.refresh();
    });
  }

  return (
    <>
    <ul className="flex flex-col gap-3">
      {applications.map((a) => {
        // Ohne Einwilligung liefert die RPC weder Name noch Antworten. Die
        // Zeile bleibt trotzdem stehen — sonst zählte die Liste anders als
        // die Kennzahlen, und der Partner wüsste nicht, dass es sie gibt.
        const hidden = istVerdeckt(a);
        const kurz = profilKurz(a.profile, profilWerte);

        return (
          <Card as="li" key={a.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-65 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {/* PART-122: die Person öffnet ihr Profil. Ohne Einwilligung gibt es keins — dann nur der Hinweis. */}
                  {hidden ? (
                    <span className="ct-label text-ink">{t.hiddenName}</span>
                  ) : (
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => setOffen(a.id)}
                      className="ct-label ct-link text-left pointer-coarse:min-h-11"
                    >
                      {a.display_name ?? t.hiddenName}
                    </button>
                  )}
                  <Badge tone={BEWERBUNG_STATUS_TON[a.status] ?? "neutral"}>
                    {statusLabels[a.status] ?? a.status}
                  </Badge>
                  {a.rank != null && <span className="ct-help">#{a.rank}</span>}
                  {wunsch?.gewuenscht.includes(a.id) && <Badge tone="accent">{t.wishBadge}</Badge>}
                </div>
                {/* Eine Zeile zum Überfliegen — das Übrige steht im Profil. */}
                {!hidden && kurz && <p className="ct-small mt-1 text-ink">{kurz}</p>}
                <p className="ct-help mt-1">
                  {t.appliedOn} {dateTime.format(new Date(a.created_at))}
                  {a.decided_at && ` · ${t.decidedOn} ${dateTime.format(new Date(a.decided_at))}`}
                </p>
                {hidden && <p className="ct-help mt-2">{t.hiddenBody}</p>}
              </div>

              {wunsch && !hidden && (
                <div className="flex flex-col items-start gap-1">
                  {wunsch.gewuenscht.includes(a.id) ? (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => onWunsch(a, false)}>
                      {busy === a.id && pending ? "…" : t.wishRemove}
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" disabled={pending || voll} onClick={() => onWunsch(a, true)}>
                      {busy === a.id && pending ? "…" : t.wishAdd}
                    </Button>
                  )}
                </div>
              )}

              {decide && (
                <div className="flex w-full max-w-75 flex-wrap gap-2">
                  {APPLICATION_DECISIONS.map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={status === "accepted" ? "primary" : "secondary"}
                      disabled={pending || a.status === status}
                      onClick={() => onDecide(a, status)}
                    >
                      {busy === a.id && pending ? "…" : (t[`decide_${status}`] ?? status)}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </ul>
    {/* Das Profil der Person (PART-122): in allen Formaten dasselbe, nur mit Einwilligung. Das Schubfach ist
        immer da und wird über `open` geöffnet; ohne Auswahl bleibt es leer und geschlossen. */}
    <Drawer
      open={imSchubfach !== null}
      onClose={() => setOffen(null)}
      closeLabel={t.detailClose}
      title={imSchubfach ? t.detailTitle.replace("{name}", imSchubfach.display_name ?? t.hiddenName) : t.detailProfile}
    >
      {imSchubfach && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Badge tone={BEWERBUNG_STATUS_TON[imSchubfach.status] ?? "neutral"}>
              {statusLabels[imSchubfach.status] ?? imSchubfach.status}
            </Badge>
            <span className="ct-help">
              {t.appliedOn} {dateTime.format(new Date(imSchubfach.created_at))}
              {imSchubfach.decided_at && ` · ${t.decidedOn} ${dateTime.format(new Date(imSchubfach.decided_at))}`}
            </span>
          </div>
          <BewerbungProfil application={imSchubfach} t={t} werte={profilWerte} />
        </>
      )}
    </Drawer>
    </>
  );
}
