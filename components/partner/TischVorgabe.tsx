"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { copyTableQuestions, setSessionQuestions } from "@/app/(partner)/partner/actions";
import { uebernahmeFehler, uebernommenText } from "@/lib/partner/tischvorgabe";
import { FragenKaesten } from "./FragenAuswahl";

/**
 * Die Tischvorgabe der Bewerbungsfragen (PART-150): die Fragen des **ersten Gesprächs** des Tisches, die ein Klick auf alle anderen übernimmt. Der Hauptknopf
 * ist der Normalfall — „Speichern und auf alle n Gespräche übernehmen“ speichert die Katalogwahl am ersten Gespräch (nur, wenn sie sich geändert hat) und
 * ruft dann `partner_copy_table_questions`, in einer Transaktion für alle Ziele; „Nur die Vorgabe speichern“ lässt die anderen Gespräche, wie sie sind.
 * Die Übernahme ist wiederholbar (ohne Änderung schreibt sie nichts) — scheitert sie nach dem Speichern, genügt ein zweiter Klick.
 *
 * Die Abschnitte „Fragen unseres Teams“ und „Eigene Fragen“ kommen als fertig gezeichnete Teile von der Seite (`team`, `eigene`): eine eigene Frage wird
 * sofort am ersten Gespräch beantragt (`EigeneFrageAntrag`) und wandert mit der Übernahme zu den anderen, eine freigegebene samt Freigabe.
 */
export function TischVorgabe({
  carrierId,
  zielIds,
  anzahl,
  waehlbar,
  gewaehlt,
  canEdit,
  titelJe,
  t,
  s,
  rpcMessages,
  team,
  eigene,
}: {
  /** Das erste Gespräch des Tisches — die Vorgabe. */
  carrierId: string;
  /** Alle übrigen Gespräche des Tisches (Ziele der Übernahme). */
  zielIds: string[];
  /** Alle Gespräche des Tisches, die Vorgabe mitgezählt (steht im Knopf). */
  anzahl: number;
  waehlbar: { id: string; label: string }[];
  gewaehlt: string[];
  canEdit: boolean;
  /** Titel je Gespräch, damit eine Fehlermeldung sagt, welches Gespräch gemeint ist. */
  titelJe: Record<string, string>;
  /** `partnerInterviewTables`. */
  t: Record<string, string>;
  /** `partnerBewerbung`. */
  s: Record<string, string>;
  rpcMessages: Record<string, string>;
  team: ReactNode;
  eigene: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [aktion, setAktion] = useState<"alle" | "nur" | null>(null);
  const [basis, setBasis] = useState<string[]>(gewaehlt);
  const [auswahl, setAuswahl] = useState<string[]>(gewaehlt);
  const [fehler, setFehler] = useState<string | null>(null);
  const geaendert = auswahl.length !== basis.length || auswahl.some((id) => !basis.includes(id));

  function umschalten(id: string) {
    setAuswahl((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  }

  function speichern(mitUebernahme: boolean) {
    setFehler(null);
    setAktion(mitUebernahme ? "alle" : "nur");
    startTransition(async () => {
      if (geaendert) {
        const res = await setSessionQuestions(carrierId, auswahl);
        if (!res.ok) {
          setFehler(uebernahmeFehler(res, rpcMessages, titelJe, t.vorgabeErrorAt));
          setAktion(null);
          return;
        }
        setBasis(auswahl);
      }
      if (mitUebernahme) {
        const res = await copyTableQuestions(carrierId, zielIds);
        if (!res.ok) {
          setFehler(uebernahmeFehler(res, rpcMessages, titelJe, t.vorgabeErrorAt));
          setAktion(null);
          return;
        }
        toast("success", uebernommenText(res.data.sessions, t as Parameters<typeof uebernommenText>[1]));
      } else {
        toast("success", t.vorgabeSaved);
      }
      setAktion(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {team}

      <section aria-label={s.catalogTitle}>
        <h3 className="ct-label text-ink">{s.catalogTitle}</h3>
        {waehlbar.length === 0 ? (
          <p className="ct-help mt-1">{s.catalogEmpty}</p>
        ) : (
          <div className="mt-2">
            <FragenKaesten waehlbar={waehlbar} auswahl={auswahl} canEdit={canEdit} onUmschalten={umschalten} />
          </div>
        )}
      </section>

      {eigene}

      {fehler && (
        <p role="alert" className="ct-small text-error-ink">
          {fehler}
        </p>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button loading={pending && aktion === "alle"} disabled={pending && aktion !== "alle"} onClick={() => speichern(true)}>
            {/* Unter 640 px die Kurzform (Design 10.10.2026, Sichtprüfung PART-150): „Speichern und auf alle 6 Gespräche übernehmen“ bricht bei 375 px in zwei Zeilen,
                und ein Kit-Knopf hat feste Höhe — der Text stand mit 39 px in 44. Die Zahl steht im Satz darüber („für alle {n} Gespräche“) und in der Meldung danach. */}
            <span className="sm:hidden">{t.vorgabeSaveAllShort}</span>
            <span className="max-sm:hidden">{t.vorgabeSaveAll.replace("{n}", String(anzahl))}</span>
          </Button>
          <Button
            variant="secondary"
            loading={pending && aktion === "nur"}
            disabled={!geaendert || (pending && aktion !== "nur")}
            onClick={() => speichern(false)}
          >
            {t.vorgabeSaveOnly}
          </Button>
        </div>
      )}
    </div>
  );
}
