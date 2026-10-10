"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { fehlendAusDetail, type FehlendesFeld, type PartnerStatus } from "@/components/partner/standbuehne";
import { requestStagePublish, withdrawStagePublish } from "../../actions";

/**
 * „Veröffentlichen“ und „Zurücknehmen“ an einem Programmpunkt der gebrandeten Bühne (PART-148 c). Dieselbe **Anfrage** an die Programmleitung wie in der Tabelle der Standbühne
 * (`partner_request_publish` und `partner_withdraw_publish`, jetzt für `stage.kind in ('booth', 'branded')`): keine Freigabe, nur `review`; freigegeben oder mit Grund zurückgegeben wird
 * im Admin (`release_partner_session`, „Freigaben“). Der Knopf steht in der Kopfzeile der Karte, wo er wirkt (Skill-Regel 13).
 *
 * Was für die Anfrage noch fehlt, weiß die Seite schon (`gesperrt`, dieselben Pflichtfelder wie in der Funktion): dann ist der Knopf aus, und der Grund steht darunter in der Karte
 * (`aria-describedby`) — mit dem Weg dorthin. Kommt der Fehler trotzdem aus der Datenbank (zwischenzeitlich geändert), bleibt die Rückfrage offen und nennt die Felder
 * (`ConfirmDialog error`, ADM-062), statt zu schließen und einen Toast zu zeigen. Das Zurücknehmen braucht keine Rückfrage: es ändert nichts am Inhalt.
 */
export function VeroeffentlichenKnopf({
  sessionId,
  stand,
  gesperrt,
  hinweisId,
  t,
  rpcMessages,
}: {
  sessionId: string;
  /** Der Stand aus Sicht des Partners (`partnerStatus`): nur „in Bearbeitung“ und „zurückgegeben“ können anfragen, nur „zur Freigabe“ kann zurücknehmen. */
  stand: PartnerStatus;
  /** Es fehlen Pflichtfelder: der Knopf ist aus, `hinweisId` nennt den Grund. */
  gesperrt: boolean;
  hinweisId: string;
  /** Texte der Seite (`partnerStage`). */
  t: Record<string, string>;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const message = (key: string, detail?: string) => (rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : "");
  const feldName: Record<FehlendesFeld, string> = { title_de: t.fieldTitleDe, title_en: t.fieldTitleEn, description: t.fieldDescription };

  function schliessen() {
    setOffen(false);
    setFehler(null);
  }

  function senden() {
    startTransition(async () => {
      const res = await requestStagePublish(sessionId);
      if (!res.ok) {
        setFehler(
          res.key === "fields_required"
            ? t.missingFields.replace("{fields}", fehlendAusDetail(res.detail).map((f) => feldName[f]).join(", "))
            : message(res.key, res.detail),
        );
        router.refresh();
        return;
      }
      schliessen();
      toast("success", t.publishDone);
      router.refresh();
    });
  }

  function zuruecknehmen() {
    startTransition(async () => {
      const res = await withdrawStagePublish(sessionId);
      if (!res.ok) {
        toast("error", message(res.key, res.detail));
        return;
      }
      toast("success", t.withdrawDone);
      router.refresh();
    });
  }

  if (stand === "zur_freigabe") {
    return (
      <Button variant="ghost" size="sm" className="whitespace-nowrap" disabled={pending} onClick={zuruecknehmen}>
        {t.withdraw}
      </Button>
    );
  }
  if (stand !== "in_bearbeitung" && stand !== "zurueckgegeben") return null;

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="whitespace-nowrap"
        disabled={pending || gesperrt}
        aria-describedby={gesperrt ? hinweisId : undefined}
        onClick={() => setOffen(true)}
      >
        {t.publish}
      </Button>
      {offen && (
        <ConfirmDialog
          title={t.publishConfirmTitle}
          body={t.publishConfirmBody}
          confirmLabel={t.publishConfirm}
          cancelLabel={t.cancel}
          pending={pending}
          error={fehler}
          onConfirm={senden}
          onCancel={schliessen}
        />
      )}
    </>
  );
}
