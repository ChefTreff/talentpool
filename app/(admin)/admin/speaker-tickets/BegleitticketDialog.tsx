"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { setCompanionQuota, teamAddCompanionTicket } from "./actions";

type Strings = Record<string, string>;

/** Eine Zeile aus `speaker_ticket_quotas()`: ein bestätigter Speaker mit seinem Begleitticket-Kontingent. */
export type KontingentZeile = {
  profile_id: string;
  speaker_name: string;
  pass_type: string | null;
  lounge_access: boolean;
  companion_quota: number;
  companions_active: number;
  own_status: string | null;
};

/**
 * „Begleitticket anlegen“ (ADM-076): das Team legt für einen Speaker eine Begleitung an — direkt freigegeben, mit Lounge
 * nach Wunsch. Ausgestellt wird danach in der Liste („Ausstellen“, vivenu); der Speaker bekommt die Mail „Begleitticket
 * bestätigt“ (ohne Adresse der Begleitung).
 *
 * **Ist das Kontingent voll,** steht das hier, und mit einem Knopf lässt es sich um eins erhöhen — ohne die Seite zu
 * wechseln. Die Datenbank prüft es trotzdem (`quota_exceeded`): der Dialog erspart nur den Umweg.
 */
export function BegleitticketDialog({
  speakers,
  start,
  t,
  rpcMessages,
  onClose,
}: {
  speakers: KontingentZeile[];
  /** Vorgewählter Speaker (aus der Kontingent-Tabelle); sonst wählt man ihn im Dialog. */
  start?: string;
  t: Strings;
  rpcMessages: Record<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [profile, setProfile] = useState(start ?? "");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [lounge, setLounge] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Nach „Kontingent erhöhen“ gilt die neue Zahl, bis die Seite neu geladen hat.
  const [erhoeht, setErhoeht] = useState<Record<string, number>>({});

  const message = (key: string, detail?: string) =>
    (rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : "");
  const gewaehlt = speakers.find((s) => s.profile_id === profile) ?? null;
  const kontingent = gewaehlt ? (erhoeht[gewaehlt.profile_id] ?? gewaehlt.companion_quota) : 0;
  const voll = gewaehlt !== null && gewaehlt.companions_active >= kontingent;
  const bereit = gewaehlt !== null && !voll && first.trim() !== "" && last.trim() !== "" && email.trim() !== "";

  function onRaise() {
    if (!gewaehlt) return;
    startTransition(async () => {
      setFehler(null);
      const neu = kontingent + 1;
      const res = await setCompanionQuota(gewaehlt.profile_id, neu);
      if (!res.ok) {
        setFehler(message(res.key, res.detail));
        return;
      }
      setErhoeht((e) => ({ ...e, [gewaehlt.profile_id]: neu }));
      toast("success", t.quotaSaved);
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!gewaehlt || !bereit) return;
    startTransition(async () => {
      setFehler(null);
      const res = await teamAddCompanionTicket(gewaehlt.profile_id, email, first, last, lounge);
      if (!res.ok) {
        setFehler(message(res.key, res.detail));
        return;
      }
      toast("success", t.added);
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal label={t.addTitle} onCancel={onClose} error={fehler}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <h2 className="ct-h3">{t.addTitle}</h2>
          <p className="ct-help mt-2">{t.addLead}</p>
        </div>

        <Field label={t.fieldSpeaker} htmlFor="bt_speaker">
          <Select
            id="bt_speaker"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder={t.fieldSpeakerPlaceholder}
            options={speakers.map((s) => ({
              value: s.profile_id,
              label: `${s.speaker_name} · ${t.quotaOf
                .replace("{used}", String(s.companions_active))
                .replace("{quota}", String(erhoeht[s.profile_id] ?? s.companion_quota))}`,
            }))}
          />
        </Field>

        {voll && (
          <div className="rounded-ct-md border bg-surface-hover p-3">
            <p className="ct-help">{t.quotaFullHint.replace("{quota}", String(kontingent))}</p>
            {kontingent < 50 && (
              <Button type="button" size="sm" variant="secondary" className="mt-2" disabled={pending} onClick={onRaise}>
                {t.raiseQuota.replace("{quota}", String(kontingent + 1))}
              </Button>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.fieldFirst} htmlFor="bt_first">
            <Input id="bt_first" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={100} />
          </Field>
          <Field label={t.fieldLast} htmlFor="bt_last">
            <Input id="bt_last" value={last} onChange={(e) => setLast(e.target.value)} maxLength={100} />
          </Field>
        </div>
        <Field label={t.fieldEmail} htmlFor="bt_email" hint={t.fieldEmailHint}>
          <Input id="bt_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
        </Field>
        <Checkbox label={t.fieldLounge} hint={t.fieldLoungeHint} checked={lounge} onChange={(e) => setLounge(e.target.checked)} />

        <div className="flex gap-2">
          <Button type="submit" disabled={pending || !bereit}>
            {t.addSubmit}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
