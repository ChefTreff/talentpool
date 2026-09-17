import { headers } from "next/headers";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { areasFor } from "@/lib/areas";
import { KioskScanner } from "./KioskScanner";

export const dynamic = "force-dynamic";

/** Pass-Typen, wie sie am Einlass vorkommen. */
const PASS_TYPES = ["talent", "partner", "speaker", "crew", "investor", "professional"] as const;

/**
 * Das Kiosk am Einlass (B4).
 *
 * Das Gate ist `requireArea("checkin")` — wer die Rolle nicht hat, bekommt 404
 * und nicht etwa eine leere Scan-Fläche. Die Gerätekennung kommt aus dem
 * Konto, nicht aus einem Feld: ein Kiosk-Konto gehört zu genau einem Gerät
 * (E8), und ein Feld dafür wäre nur eine Stelle, an der jemand sich vertippt.
 */
export default async function CheckinPage() {
  const ctx = await requireArea("checkin", "/checkin");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const vocab = await loadVocabMap(supabase, locale);
  const passLabels = Object.fromEntries(PASS_TYPES.map((p) => [p, vlabel(vocab, "pass_type", p)]));

  // Gerätekennung fürs Protokoll: die Mailadresse des Kontos (`checkin-1@…`)
  // ist genau die Kennung, die auf dem Gerät klebt.
  const device = ctx.user?.email ?? (await headers()).get("user-agent")?.slice(0, 64) ?? "kiosk";

  // Wer neben dem Kiosk noch Bereiche hat, kommt sonst nicht mehr weg —
  // das Kiosk hat bewusst kein Menü.
  const andere = areasFor(ctx.roleNames).filter((a) => a.key !== "checkin");

  return (
    <>
      <KioskScanner device={device} t={t.checkin} passLabels={passLabels} />
      {andere.length > 0 && (
        <p className="px-4 pb-4 sm:px-6">
          <a className="ct-link ct-help" href={andere[0].path}>
            {t.checkin.leave}
          </a>
        </p>
      )}
    </>
  );
}
