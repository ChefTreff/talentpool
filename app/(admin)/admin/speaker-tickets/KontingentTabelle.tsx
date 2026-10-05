"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { SuchFeld } from "@/components/ui/SuchFeld";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { BegleitticketDialog, type KontingentZeile } from "./BegleitticketDialog";
import { setCompanionQuota, setSpeakerLounge } from "./actions";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = {
  requested: "accent",
  approved: "accent",
  valid: "success",
};

/**
 * Die Ansicht „Kontingente“ (ADM-076): je bestätigtem Speaker, wie viele Begleittickets er haben darf und wie viele
 * vergeben sind — mit dem Feld, es zu ändern (Begleittickets beliebig, Konrads Prüfpunkt), dem Schalter für die Lounge
 * am eigenen Ticket und dem Weg, eine Begleitung anzulegen.
 *
 * Die Zeilen kommen aus `speaker_ticket_quotas()` (Team-Tor in der Datenbank). Das Kontingent liegt zwischen 0 und 50 und
 * lässt sich nicht unter die vergebenen senken (`quota_below_used`) — die Oberfläche prüft nur den Bereich, die
 * Datenbank hat das letzte Wort.
 */
export function KontingentTabelle({
  rows,
  t,
  common,
  rpcMessages,
  passTypes,
}: {
  rows: KontingentZeile[];
  t: Strings;
  common: { none: string };
  rpcMessages: Record<string, string>;
  passTypes: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [suche, setSuche] = useState("");
  const [entwurf, setEntwurf] = useState<Record<string, string>>({});
  const [anlegenFuer, setAnlegenFuer] = useState<string | null>(null);

  const message = (key: string, detail?: string) =>
    (rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : "");
  const gefiltert = rows.filter((r) => r.speaker_name.toLowerCase().includes(suche.trim().toLowerCase()));

  function onSaveQuota(r: KontingentZeile) {
    const wert = Number(entwurf[r.profile_id] ?? r.companion_quota);
    if (!Number.isInteger(wert) || wert < 0 || wert > 50) {
      toast("error", t.quotaInvalid);
      return;
    }
    startTransition(async () => {
      const res = await setCompanionQuota(r.profile_id, wert);
      if (!res.ok) {
        toast("error", message(res.key, res.detail));
        return;
      }
      // Der Entwurf gilt nicht mehr: das Feld zeigt wieder den gespeicherten Wert.
      setEntwurf((e) => Object.fromEntries(Object.entries(e).filter(([id]) => id !== r.profile_id)));
      toast("success", t.quotaSaved);
      router.refresh();
    });
  }

  function onLounge(r: KontingentZeile, an: boolean) {
    startTransition(async () => {
      const res = await setSpeakerLounge(r.profile_id, an);
      if (!res.ok) {
        toast("error", message(res.key, res.detail));
        return;
      }
      toast("success", t.loungeSaved);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4 max-w-sm">
        <Field label={t.searchLabel} htmlFor="kontingent-suche">
          <SuchFeld id="kontingent-suche" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t.searchPlaceholder} />
        </Field>
      </div>

      {gefiltert.length === 0 ? (
        <p className="ct-help">{t.noSpeakers}</p>
      ) : (
        <Table stapeln>
          <Thead>
            <Th>{t.colSpeaker}</Th>
            <Th>{t.colPass}</Th>
            <Th>{t.colOwnTicket}</Th>
            <Th>{t.colLounge}</Th>
            <Th>{t.colQuota}</Th>
            <Th aria-label={t.colAction} />
          </Thead>
          <Tbody>
            {gefiltert.map((r) => {
              const voll = r.companions_active >= r.companion_quota;
              return (
                <Tr key={r.profile_id}>
                  <Td>{r.speaker_name}</Td>
                  <Td label={t.colPass} className="text-muted">
                    {r.pass_type ? (passTypes[r.pass_type] ?? r.pass_type) : common.none}
                  </Td>
                  <Td label={t.colOwnTicket}>
                    {r.own_status ? (
                      <Badge tone={TONE[r.own_status] ?? "neutral"}>{t[`status_${r.own_status}`] ?? r.own_status}</Badge>
                    ) : (
                      <span className="ct-help">{common.none}</span>
                    )}
                  </Td>
                  <Td label={t.colLounge}>
                    <Checkbox
                      aria-label={t.loungeFor.replace("{name}", r.speaker_name)}
                      checked={r.lounge_access}
                      disabled={pending}
                      onChange={(e) => onLounge(r, e.target.checked)}
                    />
                  </Td>
                  <Td label={t.colQuota}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={voll ? "ct-label text-ink" : "ct-help"}>
                        {t.quotaOf.replace("{used}", String(r.companions_active)).replace("{quota}", String(r.companion_quota))}
                      </span>
                      <Input
                        aria-label={t.quotaFieldFor.replace("{name}", r.speaker_name)}
                        type="number"
                        min={0}
                        max={50}
                        className="w-20"
                        value={entwurf[r.profile_id] ?? String(r.companion_quota)}
                        onChange={(e) => setEntwurf((x) => ({ ...x, [r.profile_id]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending || (entwurf[r.profile_id] ?? String(r.companion_quota)) === String(r.companion_quota)}
                        onClick={() => onSaveQuota(r)}
                      >
                        {t.save}
                      </Button>
                    </div>
                  </Td>
                  <Td>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAnlegenFuer(r.profile_id)}>
                      {t.addCompanionShort}
                    </Button>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}

      {anlegenFuer && (
        <BegleitticketDialog
          speakers={rows}
          start={anlegenFuer}
          t={t}
          rpcMessages={rpcMessages}
          onClose={() => setAnlegenFuer(null)}
        />
      )}
    </>
  );
}
