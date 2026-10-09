"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { BEWERBUNG_STATUS_TON } from "@/components/partner/bewerbung";
import { BewerbungDetails } from "@/components/partner/BewerbungDetails";
import { ENTSCHEIDBAR, ENTSCHEIDUNGEN, SAMMEL_MAX, type Entscheidung } from "@/lib/bewerbungen/liste";
import { mitZusageFrist } from "@/lib/mail/zusage-frist";
import { decideApplication, decideApplicationsBulk } from "./actions";

type Strings = Record<string, string>;

/** Eine Zeile der Liste, für die Anzeige vorbereitet (Fragetexte und Vokabeln aufgelöst). */
export type ListenZeile = {
  id: string;
  session_id: string;
  session_titel: string;
  format_label: string | null;
  released: boolean;
  display_name: string | null;
  email: string | null;
  status: string;
  rank: number | null;
  consent_share: boolean;
  created_at: string;
  decided_at: string | null;
  profile: Record<string, string> | null;
  answers: Record<string, unknown> | null;
};

/**
 * Bewerbungen über alle Sessions (ADM-003) — Archetyp A: Zeilen statt
 * Kartenwand, Details klappen auf, höchstens eine Zeile gleichzeitig.
 *
 * **Sammelaktion:** Häkchen je Zeile oder „alle auf dieser Seite“, dann eine
 * Entscheidung für alle. Vorher eine Rückfrage mit der Anzahl und — wenn
 * Sessions darunter schon freigegeben sind — dem Hinweis, dass dort die Mails
 * sofort rausgehen (so verschickt es auch der Einzelklick). Das Ergebnis steht
 * über der Liste, nicht im Toast: wer zwölf entscheidet und drei scheitern,
 * muss die drei finden.
 */
export function BewerbungsListe({
  zeilen,
  statusLabels,
  dateLocale,
  t,
  tBewerbung,
  rpcMessages,
}: {
  zeilen: ListenZeile[];
  statusLabels: Record<string, string>;
  dateLocale: string;
  t: Strings;
  /** Texte der Bewerbungsdetails (Profilfelder, Entscheidungen) — dieselben wie im Partner-Portal. */
  tBewerbung: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [offen, setOffen] = useState<string | null>(null);
  const [frage, setFrage] = useState<Entscheidung | null>(null);
  const [ergebnis, setErgebnis] = useState<{ text: string; fehler: boolean } | null>(null);
  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });

  const meldung = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const ausgewaehlt = zeilen.filter((z) => gewaehlt.has(z.id));
  const waehlbar = zeilen.filter((z) => ENTSCHEIDBAR.has(z.status));
  const alleGewaehlt = waehlbar.length > 0 && ausgewaehlt.length === waehlbar.length;
  const freigegebenUnter = ausgewaehlt.filter((z) => z.released).length;

  function umschalten(id: string, an: boolean) {
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (an) neu.add(id);
      else neu.delete(id);
      return neu;
    });
  }

  function sammeln(status: Entscheidung) {
    const ids = ausgewaehlt.map((z) => z.id).slice(0, SAMMEL_MAX);
    setFrage(null);
    setErgebnis(null);
    startTransition(async () => {
      const res = await decideApplicationsBulk(ids, status);
      if (!res.ok) {
        setErgebnis({ text: meldung(res.key) + (res.detail ? ` (${res.detail})` : ""), fehler: true });
        return;
      }
      const { ok, fehler } = res.data;
      if (fehler.length === 0) {
        toast("success", t.bulkDone.replace("{n}", String(ok)));
      } else {
        const gruende = fehler.map(([key, n]) => `${meldung(key)} (${n})`).join(", ");
        setErgebnis({
          text: t.bulkPartial
            .replace("{ok}", String(ok))
            .replace("{n}", String(fehler.reduce((summe, [, n]) => summe + n, 0)))
            .replace("{gruende}", gruende),
          fehler: true,
        });
      }
      setGewaehlt(new Set());
      router.refresh();
    });
  }

  function einzeln(z: ListenZeile, status: Entscheidung) {
    setErgebnis(null);
    startTransition(async () => {
      const res = await decideApplication(z.session_id, z.id, status, null);
      if (!res.ok) {
        setErgebnis({ text: meldung(res.key) + (res.detail ? ` (${res.detail})` : ""), fehler: true });
        return;
      }
      toast("success", t.decided);
      router.refresh();
    });
  }

  const aktion = (status: Entscheidung) => tBewerbung[`decide_${status}`] ?? statusLabels[status] ?? status;

  return (
    <div className="flex flex-col gap-3">
      {/* Sammelleiste: ohne Auswahl ein Satz, mit Auswahl die vier Entscheidungen. */}
      <div className="flex min-h-11 flex-wrap items-center gap-3" aria-live="polite">
        {ausgewaehlt.length === 0 ? (
          <p className="ct-help">{t.bulkHint}</p>
        ) : (
          <>
            <span className="ct-label text-ink">{t.selectedCount.replace("{n}", String(ausgewaehlt.length))}</span>
            {ENTSCHEIDUNGEN.map((status) => (
              <Button
                key={status}
                size="sm"
                variant={status === "accepted" ? "primary" : "secondary"}
                disabled={pending}
                onClick={() => setFrage(status)}
              >
                {aktion(status)}
              </Button>
            ))}
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setGewaehlt(new Set())}>
              {t.selectionClear}
            </Button>
          </>
        )}
      </div>

      {ergebnis && (
        <p
          role={ergebnis.fehler ? "alert" : "status"}
          className="rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink"
        >
          {ergebnis.text}
        </p>
      )}

      <Card className="p-0">
        <div className="flex items-center gap-3 border-b px-4 py-2">
          <label className="-m-3 flex h-11 cursor-pointer items-center gap-3 p-3">
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0"
              checked={alleGewaehlt}
              disabled={pending || waehlbar.length === 0}
              onChange={(e) => setGewaehlt(e.target.checked ? new Set(waehlbar.map((z) => z.id)) : new Set())}
            />
            <span className="ct-small text-ink">{t.selectAll}</span>
          </label>
        </div>
        <ul className="flex flex-col">
          {zeilen.map((z) => {
            const auf = offen === z.id;
            // Das Team sieht Namen auch ohne Einwilligung — fehlt einer, ist er nicht hinterlegt.
            const name = z.display_name ?? z.email ?? t.noName;
            return (
              <li key={z.id} className="border-b last:border-b-0">
                <div className="flex items-start gap-3 px-4 py-3">
                  <label className="-mx-3 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      aria-label={t.selectRow.replace("{name}", name)}
                      checked={gewaehlt.has(z.id)}
                      disabled={pending || !ENTSCHEIDBAR.has(z.status)}
                      onChange={(e) => umschalten(z.id, e.target.checked)}
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      aria-expanded={auf}
                      aria-controls={`bew-${z.id}`}
                      onClick={() => setOffen(auf ? null : z.id)}
                      className="flex min-h-11 w-full flex-wrap items-center gap-2 text-left"
                    >
                      <span className="ct-label text-ink">{name}</span>
                      <Badge tone={BEWERBUNG_STATUS_TON[z.status] ?? "neutral"}>{statusLabels[z.status] ?? z.status}</Badge>
                      {!z.consent_share && <Badge tone="warning">{t.noConsent}</Badge>}
                      {z.rank != null && <span className="ct-help">#{z.rank}</span>}
                    </button>
                    <p className="ct-help">
                      {[z.format_label, z.session_titel].filter(Boolean).join(" · ")}
                      {` · ${t.appliedOn} ${datum.format(new Date(z.created_at))}`}
                    </p>
                  </div>
                </div>

                {auf && (
                  <div id={`bew-${z.id}`} className="border-t bg-canvas px-4 py-4 sm:pl-12">
                    {z.email && <p className="ct-small text-ink">{z.email}</p>}
                    {!z.consent_share && <p className="ct-help mt-1">{t.noConsentHint}</p>}
                    <BewerbungDetails application={z} t={tBewerbung} verdeckt={false} />
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {ENTSCHEIDBAR.has(z.status) &&
                        ENTSCHEIDUNGEN.map((status) => (
                          <Button
                            key={status}
                            size="sm"
                            variant="secondary"
                            disabled={pending || z.status === status}
                            onClick={() => einzeln(z, status)}
                          >
                            {aktion(status)}
                          </Button>
                        ))}
                      <Link href={`/admin/bewerbungen/${z.session_id}`} className="ct-link ct-small">
                        {t.toSession}
                      </Link>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {frage && (
        <ConfirmDialog
          title={(ausgewaehlt.length === 1 ? t.bulkConfirmTitleOne : t.bulkConfirmTitle)
            .replace("{n}", String(ausgewaehlt.length))
            .replace("{aktion}", aktion(frage))}
          body={t.bulkConfirmBody}
          detail={
            freigegebenUnter > 0 ? (
              <p className="rounded-ct-md border border-warning-soft bg-warning-soft p-3 ct-small text-warning-ink">
                {/* PART-124: nach der Freigabe wartet die Zusage-Mail zehn Minuten, alle anderen gehen sofort. */}
                {mitZusageFrist(
                  freigegebenUnter === 1
                    ? t.bulkReleasedWarningOne
                    : t.bulkReleasedWarning.replace("{n}", String(freigegebenUnter)),
                )}
              </p>
            ) : undefined
          }
          confirmLabel={aktion(frage)}
          cancelLabel={t.cancel}
          pending={pending}
          onCancel={() => setFrage(null)}
          onConfirm={() => sammeln(frage)}
        />
      )}
    </div>
  );
}
