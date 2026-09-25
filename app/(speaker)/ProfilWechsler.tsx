"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { waehleSpeakerProfil } from "./speaker/actions";

/**
 * Profilwahl im Speaker-Portal (SPK-071): wer für mehrere Speaker arbeitet —
 * das eigene Profil plus welche als Assistenz oder als Kontakt eines Partners
 * (PART-091) —, wählt hier, für wen. Die Wahl merkt sich die Datenbank
 * (`set_my_speaker_profile`); alle Seiten des Portals folgen ihr, weil sie über
 * `my_speaker_profile_id` gehen. Dasselbe Muster wie der Organisations-Wechsler
 * im Partner-Portal; erscheint nur, wenn es etwas zu wählen gibt.
 */
export function ProfilWechsler({
  profile,
  currentId,
  label,
  rpcMessages,
}: {
  profile: { id: string; label: string }[];
  currentId: string;
  label: string;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  if (profile.length < 2) return null;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="speaker-profil" className="ct-eyebrow px-2.5 text-on-navy-muted">
        {label}
      </label>
      <select
        id="speaker-profil"
        value={currentId}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            const res = await waehleSpeakerProfil(next);
            if (!res.ok) {
              toast("error", rpcMessages[res.key] ?? res.key);
              return;
            }
            router.refresh();
          });
        }}
        className="h-10 w-full rounded-ct-md border border-on-navy/30 bg-navy px-2.5 ct-label text-on-navy"
      >
        {profile.map((p) => (
          <option key={p.id} value={p.id} className="text-ink">
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}
