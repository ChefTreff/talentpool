"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";

type Antwort = {
  ok: boolean; jobId: number | null;
  added: number; known: number; failed: number; orgs: number;
  aufgeloest: number; ohneKontakt: string[];
  skippedReason?: string; error?: string;
};

/**
 * Angebote und Rechnungen aus SevDesk ins Partner-Portal holen (ADM-050).
 *
 * Bis hierher lief der Abruf nur nachts und nur für Partner, deren
 * SevDesk-Kennung schon feststand — die schreibt allein der
 * Messeshop-Rechnungslauf. Wer ein Angebot hatte, aber nie im Messeshop
 * bestellt hat, fiel **still** heraus. Jetzt löst der Lauf den Kontakt über die
 * Kundennummer auf und sagt, bei wem auch das nicht ging.
 *
 * Nur lesen: es wird nichts in der Buchhaltung angelegt oder geändert.
 */
export function BelegSyncCard({ t }: { t: Record<string, string> }) {
  const [laeuft, setLaeuft] = useState(false);
  const [antwort, setAntwort] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function ruf() {
    setLaeuft(true);
    setFehler(null);
    try {
      const res = await fetch("/api/admin/partner/documents/sync", { method: "POST" });
      const json = (await res.json()) as Antwort;
      if (!res.ok || !json.ok) {
        setFehler(json.error ?? t.documentsFailed);
        return;
      }
      setAntwort(json);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card>
      <CardHeader title={t.documentsTitle} description={t.documentsLead} />
      <div className="flex flex-col gap-4">
        <div>
          <Button size="sm" loading={laeuft} onClick={ruf}>{t.documentsRun}</Button>
        </div>

        {fehler && (
          <p role="alert" className="rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink">
            {fehler}
          </p>
        )}

        {antwort && (
          <div className="flex flex-col gap-2">
            {antwort.skippedReason && <p className="ct-help">{antwort.skippedReason}</p>}
            <p className="ct-small text-ink">
              {t.documentsSummary
                .replace("{neu}", String(antwort.added))
                .replace("{bekannt}", String(antwort.known))
                .replace("{orgs}", String(antwort.orgs))}
            </p>
            {antwort.aufgeloest > 0 && (
              <p className="ct-help">{t.documentsResolved.replace("{n}", String(antwort.aufgeloest))}</p>
            )}
            {/* Wer keine Belege bekommt, steht namentlich da. Eine Zahl allein
                führt dazu, dass niemand nachsieht, wer gemeint ist. */}
            {antwort.ohneKontakt.length > 0 && (
              <div>
                <div className="ct-label text-ink">
                  {t.documentsNoContactTitle.replace("{n}", String(antwort.ohneKontakt.length))}
                </div>
                <p className="ct-help">{t.documentsNoContactHint}</p>
                <ul className="ct-help">
                  {antwort.ohneKontakt.map((n) => <li key={n}>{n}</li>)}
                </ul>
              </div>
            )}
            {antwort.failed > 0 && (
              <p className="ct-help">{t.documentsFailedCount.replace("{n}", String(antwort.failed))}</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
