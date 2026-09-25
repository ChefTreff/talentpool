"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { GastZuordnung } from "@/components/partner/GastZuordnung";
import type { GastWahl } from "@/components/partner/gaeste";
import { assignStageGuest } from "../actions";

/**
 * Speaker eines Talks zuordnen (PART-088): die Gäste der Organisation, dieselbe
 * Auswahl wie in der Tabelle der Standbühne. `partner_assign_stage_guest`
 * nimmt einen gebuchten Talk der eigenen Organisation mit dem Partner-Recht an.
 */
export function TalkGaeste({
  sessionId,
  speakers,
  gaeste,
  canEdit,
  t,
  rpcMessages,
}: {
  sessionId: string;
  speakers: { person_id: string; name: string }[];
  gaeste: GastWahl[];
  canEdit: boolean;
  t: { label: string; none: string; noGuests: string; choose: string; add: string; remove: string; assigned: string; unassigned: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const message = (key: string, detail?: string) =>
    (rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : "");

  function onGast(profileId: string, zuordnen: boolean) {
    startTransition(async () => {
      const res = await assignStageGuest(sessionId, profileId, zuordnen);
      if (!res.ok) {
        toast("error", message(res.key, res.detail));
        return;
      }
      toast("success", zuordnen ? t.assigned : t.unassigned);
      router.refresh();
    });
  }

  return <GastZuordnung speakers={speakers} gaeste={gaeste} canEdit={canEdit} pending={pending} t={t} onGast={onGast} />;
}
