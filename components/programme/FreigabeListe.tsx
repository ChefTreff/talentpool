"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { publishSession, releasePartnerSession } from "./actions";

/** Eine Session einer Standbühne in `review` (aus `partner_sessions_pending`). */
export type PartnerFreigabe = {
  session_id: string;
  org_name: string | null;
  format: string | null;
  title_de: string | null;
  when: string | null;
  stage_name: string | null;
};

/** Eine noch nicht veröffentlichte Session einer Hauptbühne (aus `programme_board`). */
export type BuehnenFreigabe = {
  session_id: string;
  title_de: string | null;
  title_en: string | null;
  format: string | null;
  when: string;
  stage_name: string;
  speakers: number;
  /** Wohin „Im Board öffnen" führt — Veranstaltung und Tag stehen schon drin. */
  boardHref: string;
};

/**
 * Die Freigabe durch die Programmleitung (LEAD-022).
 *
 * Konrad, 24.09.: Slots von Standbühnen und von den Bühnen der Stage Leads
 * gehen ohne finale Freigabe ins Programm → ein eigener Bereich für die
 * Programmleitung (Paulina), um sie zu prüfen und freizugeben.
 *
 * **Standbühnen** laufen über `release_partner_session` (PART-050). Die
 * Funktion gab es, aber keine Oberfläche rief sie auf — Partner-Sessions
 * blieben in `review` liegen. Freigeben oder mit Grund zurückgeben.
 *
 * **Den Grund sieht der Partner noch nicht.** Die Funktion schreibt ihn nur ins
 * Audit-Log, und keine Partner-Seite liest ihn. Der Dialog sagt das deshalb,
 * statt etwas zu versprechen, das nicht passiert.
 *
 * **Hauptbühnen** laufen über `publish_session`. Zurückgeben mit Grund gibt es
 * dort noch nicht — der Lead hätte keinen Ort, an dem er den Grund liest.
 * Deshalb steht daneben „Im Board öffnen": man korrigiert selbst oder spricht
 * mit dem Lead. Was zum Veröffentlichen fehlt (ein Speaker), steht **vor** dem
 * Knopf, statt dass er in eine Fehlermeldung läuft.
 *
 * Ohne das Recht zu veröffentlichen ist die Liste zum Lesen da; Knöpfe, die
 * immer in 42501 laufen, wären schlimmer als keine (`permissions.ts`).
 */
export function FreigabeListe({
  partner,
  buehnen,
  canRelease,
  formatLabels,
  t,
  rpcMessages,
}: {
  partner: PartnerFreigabe[];
  buehnen: BuehnenFreigabe[];
  canRelease: boolean;
  formatLabels: Record<string, string>;
  t: Record<string, string>;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [zurueck, setZurueck] = useState<PartnerFreigabe | null>(null);
  const [grund, setGrund] = useState("");

  const message = (key: string, detail?: string) =>
    (rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : "");

  function run(p: Promise<{ ok: true } | { ok: false; key: string; detail?: string }>, okText: string, danach?: () => void) {
    startTransition(async () => {
      const res = await p;
      if (!res.ok) {
        toast("error", message(res.key, res.detail));
        return;
      }
      toast("success", okText);
      danach?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="h-partner">
        <h2 id="h-partner" className="ct-h3 mb-1 text-ink">
          {t.partnerTitle}
        </h2>
        <p className="ct-help mb-3">{t.partnerLead}</p>
        {partner.length === 0 ? (
          <EmptyState title={t.partnerEmpty} description={t.partnerEmptyBody} />
        ) : (
          <ul className="flex flex-col gap-3">
            {partner.map((p) => (
              <li key={p.session_id}>
                <Card className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="ct-label text-ink">{p.title_de ?? t.untitled}</p>
                    <p className="ct-help">
                      {[p.org_name, p.format ? formatLabels[p.format] ?? p.format : null, p.stage_name, p.when]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {canRelease && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => run(releasePartnerSession(p.session_id, true, null), t.released)}
                      >
                        {t.release}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => {
                          setGrund("");
                          setZurueck(p);
                        }}
                      >
                        {t.returnIt}
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="h-buehnen">
        <h2 id="h-buehnen" className="ct-h3 mb-1 text-ink">
          {t.stagesTitle}
        </h2>
        <p className="ct-help mb-3">{t.stagesLead}</p>
        {buehnen.length === 0 ? (
          <EmptyState title={t.stagesEmpty} description={t.stagesEmptyBody} />
        ) : (
          <ul className="flex flex-col gap-3">
            {buehnen.map((b) => {
              const ohneSpeaker = b.speakers === 0;
              return (
                <li key={b.session_id}>
                  <Card className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="ct-label text-ink">{b.title_de ?? b.title_en ?? t.untitled}</p>
                      <p className="ct-help">
                        {[b.stage_name, b.when, b.format ? formatLabels[b.format] ?? b.format : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {ohneSpeaker && <Badge tone="warning">{t.noSpeaker}</Badge>}
                    <div className="flex flex-wrap gap-2">
                      {canRelease && (
                        <Button
                          size="sm"
                          disabled={pending || ohneSpeaker}
                          title={ohneSpeaker ? t.noSpeakerHint : undefined}
                          onClick={() => run(publishSession(b.session_id), t.released)}
                        >
                          {t.release}
                        </Button>
                      )}
                      <a
                        href={b.boardHref}
                        className="inline-flex min-h-11 items-center rounded-ct-sm px-3 ct-label text-ink hover:bg-surface-hover"
                      >
                        {t.openBoard}
                      </a>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {zurueck && (
        <Modal label={t.returnTitle} onCancel={() => setZurueck(null)}>
          <h2 className="ct-h3 mb-1 text-ink">{t.returnTitle}</h2>
          <p className="ct-help mb-4">{t.returnLead}</p>
          <Field label={t.reason} htmlFor="grund" required>
            <Textarea id="grund" rows={3} value={grund} onChange={(e) => setGrund(e.target.value)} />
          </Field>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button
              disabled={pending || !grund.trim()}
              onClick={() =>
                run(releasePartnerSession(zurueck.session_id, false, grund.trim()), t.returned, () =>
                  setZurueck(null),
                )
              }
            >
              {t.returnIt}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setZurueck(null)}>
              {t.cancel}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
