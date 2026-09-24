"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Strings = Record<string, string>;

/**
 * Die Erlaubnis, das Logo für die Foto-Wand einfarbig weiß zu drucken
 * (PART-053, Konrad 22.09.).
 *
 * **Eine Komponente für zwei Orte** (Regel vom 22.09.: was ein Portal kann,
 * muss der Admin auch können). Im Partner-Portal steht sie am Logo-Upload, im
 * Admin an der Organisation — beide rufen dieselbe RPC, die den Unterschied
 * selbst macht: `partner_can_edit` lässt das Partner-Team ohnehin durch. Was
 * sich unterscheidet, ist allein die Server-Action, weil jeder Bereich seinen
 * eigenen Zugangsschutz (`requireArea`) trägt.
 *
 * Der Hinweistext ist hier kein Kleingedrucktes. Weißen verändert die Marke
 * des Partners; er soll wissen, worin er einwilligt, **bevor** er zustimmt.
 * Deshalb steht er über dem Knopf und nicht in einer Fußnote.
 */
export function LogoWandEinwilligung({
  grantedAt,
  canEdit,
  onSet,
  dateLocale,
  t,
  rpcMessages,
}: {
  /** `null` heißt: keine Erlaubnis — das Logo kommt nicht auf die Wand. */
  grantedAt: string | null;
  canEdit: boolean;
  onSet: (granted: boolean) => Promise<{ ok: true } | { ok: false; key: string }>;
  dateLocale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSaving] = useTransition();
  const [offen, setOffen] = useState(false);

  const datum = grantedAt
    ? new Intl.DateTimeFormat(dateLocale, { dateStyle: "long" }).format(new Date(grantedAt))
    : null;

  function setzen(granted: boolean) {
    startSaving(async () => {
      const res = await onSet(granted);
      if (!res.ok) {
        toast("error", rpcMessages[res.key] ?? rpcMessages.unknown);
        return;
      }
      toast("success", granted ? t.granted : t.revoked);
      setOffen(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-ct-md border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="ct-label text-ink">{t.title}</h4>
        <Badge tone={grantedAt ? "success" : "neutral"}>
          {grantedAt ? t.badgeGranted : t.badgeMissing}
        </Badge>
      </div>

      {/* Erst erklären, dann fragen. */}
      <p className="ct-small mt-2 leading-6">{t.explain}</p>

      {grantedAt ? (
        <p className="ct-help mt-2">{t.grantedOn.replace("{date}", datum ?? "")}</p>
      ) : (
        <p className="ct-help mt-2">{t.consequence}</p>
      )}

      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          {grantedAt ? (
            offen ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => setzen(false)} disabled={saving}>
                  {saving ? t.saving : t.confirmRevoke}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setOffen(false)} disabled={saving}>
                  {t.cancel}
                </Button>
              </>
            ) : (
              // Zurücknehmen ist möglich, aber nicht der erste Knopf: eine erteilte
              // Erlaubnis soll nicht aus Versehen verschwinden.
              <Button variant="ghost" size="sm" onClick={() => setOffen(true)} disabled={saving}>
                {t.revoke}
              </Button>
            )
          ) : (
            <Button size="sm" onClick={() => setzen(true)} disabled={saving}>
              {saving ? t.saving : t.grant}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
