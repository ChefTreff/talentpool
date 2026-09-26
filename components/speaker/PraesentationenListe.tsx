"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileButton } from "@/components/ui/FileButton";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { SPEAKER_BUCKET, safeFileName } from "@/app/(speaker)/speaker/types";
import { MAX_UPLOAD_BYTES, PRESENTATION_MIME } from "@/app/(speaker)/speaker/session/types";
import { fehlende, type PraesentationsSpeaker, type PraesentationsZeile } from "./praesentationen";

type Strings = Record<string, string>;

/** Die Server-Aktion, die eine hochgeladene Präsentation einträgt — je Bereich eine, hinter dessen Tor. */
export type PraesentationRegistrieren = (input: {
  profileId: string;
  sessionId: string;
  storagePath: string;
  filename: string;
  mime: string | null;
  sizeBytes: number | null;
}) => Promise<{ ok: true; data: { version: number; late: boolean } } | { ok: false; key: string; detail?: string }>;

/** Wie in der Technik-Prüfung: offen, geprüft, Problem. */
const TONE: Record<string, BadgeTone> = { pending: "neutral", checked: "success", issue: "error" };

/**
 * Präsentationen je Slot (LEAD-023): alle Sessions, die der Blick bearbeiten
 * darf, je Speaker der Stand und ein Upload. Für den Fall, dass eine Datei per
 * Mail kommt — sie landet wie ein Upload aus dem Speaker-Portal am Profil und
 * an der Session (`register_speaker_asset`, Pfad `<edition>/<profil>/presentation/…`)
 * und geht damit auch in die Technik-Prüfung und die Drive-Spiegelung (SPK-023).
 *
 * Fehler stehen an der Zeile, nicht als Toast (ADM-062).
 */
export function PraesentationenListe({
  zeilen,
  editionId,
  timezone,
  dateLocale,
  register,
  t,
  tCheck,
  rpcMessages,
}: {
  zeilen: PraesentationsZeile[];
  editionId: string;
  timezone: string;
  dateLocale: string;
  register: PraesentationRegistrieren;
  t: Strings;
  /** Bezeichnungen der Prüfstände (`admin.tech.check_*`). */
  tCheck: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [buehne, setBuehne] = useState("");
  const [nurFehlend, setNurFehlend] = useState(false);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [fehler, setFehler] = useState<Record<string, string>>({});

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const zeit = new Intl.DateTimeFormat(dateLocale, { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: timezone });
  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "short", timeStyle: "short", timeZone: timezone });

  const buehnen = useMemo(() => {
    const m = new Map<string, string>();
    for (const z of zeilen) m.set(z.stage_id, z.stage_name);
    return [...m].map(([value, label]) => ({ value, label }));
  }, [zeilen]);

  const sichtbar = useMemo(
    () =>
      zeilen
        .filter((z) => !buehne || z.stage_id === buehne)
        .map((z) => (nurFehlend ? { ...z, speakers: z.speakers.filter((s) => s.profile_id && !s.datei) } : z))
        .filter((z) => !nurFehlend || z.speakers.length > 0),
    [zeilen, buehne, nurFehlend],
  );
  const offen = fehlende(zeilen);

  async function hochladen(z: PraesentationsZeile, s: PraesentationsSpeaker, file: File) {
    if (!s.profile_id) return;
    const key = `${s.profile_id}:${z.session_id}`;
    const setze = (text: string) => setFehler((f) => ({ ...f, [key]: text }));
    setze("");
    if (file.size > MAX_UPLOAD_BYTES) return setze(t.uploadTooBig);
    if (file.type && !PRESENTATION_MIME.includes(file.type)) return setze(t.uploadWrongType);

    setLaeuft(key);
    try {
      const supabase = createSupabaseBrowserClient();
      const path = `${editionId}/${s.profile_id}/presentation/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error } = await supabase.storage.from(SPEAKER_BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (error) return setze(`${t.uploadFailed} (${error.message})`);
      const profileId = s.profile_id;
      start(async () => {
        const res = await register({
          profileId,
          sessionId: z.session_id,
          storagePath: path,
          filename: file.name,
          mime: file.type || null,
          sizeBytes: file.size,
        });
        if (!res.ok) {
          // Die Datei liegt dann verwaist im Bucket — wie im Portal: melden,
          // nicht im Fehlerfall noch einmal löschen.
          setze(message(res.key) + (res.detail ? ` (${res.detail})` : ""));
          return;
        }
        toast("success", res.data.late ? `${t.uploadDone} · ${t.uploadLate}` : `${t.uploadDone} (v${res.data.version})`);
        router.refresh();
      });
    } finally {
      setLaeuft(null);
    }
  }

  if (zeilen.length === 0) return <EmptyState title={t.emptyTitle} description={t.emptyBody} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        {buehnen.length > 1 && (
          <Select
            aria-label={t.colSlot}
            className="w-56"
            value={buehne}
            placeholder={t.allStages}
            options={buehnen}
            onChange={(e) => setBuehne(e.target.value)}
          />
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-5 w-5" checked={nurFehlend} onChange={(e) => setNurFehlend(e.target.checked)} />
          <span className="ct-small">{t.onlyMissing}</span>
        </label>
        <span className="ct-help ml-auto tabular-nums">
          {t.shown.replace("{n}", String(zeilen.length)).replace("{missing}", String(offen))}
        </span>
      </div>

      {sichtbar.length === 0 ? (
        <EmptyState title={t.allThereTitle} description={t.allThereBody} />
      ) : (
        <Table>
          <Thead>
            <Th>{t.colSlot}</Th>
            <Th>{t.colSession}</Th>
            <Th>{t.colSpeaker}</Th>
            <Th>{t.colFile}</Th>
          </Thead>
          <Tbody>
            {sichtbar.flatMap((z) => {
              const kopf = (
                <>
                  <Td className="tabular-nums text-muted">
                    {zeit.format(new Date(z.start_at))}
                    <span className="ct-help block">{z.stage_name}</span>
                  </Td>
                  <Td>{z.titel}</Td>
                </>
              );
              if (z.speakers.length === 0) {
                return [
                  <Tr key={z.session_id}>
                    {kopf}
                    <Td className="text-muted">{t.noSpeakers}</Td>
                    <Td className="text-muted">—</Td>
                  </Tr>,
                ];
              }
              return z.speakers.map((s, i) => {
                const key = `${s.profile_id ?? s.person_id}:${z.session_id}`;
                return (
                  <Tr key={key} controls>
                    {i === 0 ? kopf : (<><Td /><Td /></>)}
                    <Td>{s.name}</Td>
                    <Td>
                      <div className="flex flex-col gap-1">
                        {s.datei ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge tone={TONE[s.datei.status] ?? "neutral"}>{tCheck[s.datei.status] ?? s.datei.status}</Badge>
                            <span className="ct-help">
                              {s.datei.filename} ·{" "}
                              {t.fileInfo
                                .replace("{version}", String(s.datei.version))
                                .replace("{date}", datum.format(new Date(s.datei.hochgeladen)))}
                              {s.datei.late && ` · ${t.late}`}
                            </span>
                          </span>
                        ) : (
                          <span>
                            <Badge tone="warning">{t.missing}</Badge>
                          </span>
                        )}
                        {s.profile_id ? (
                          <FileButton
                            label={laeuft === key ? t.uploading : s.datei ? t.replace : t.upload}
                            uploadLabel={t.fileUpload}
                            changeLabel={t.fileChange}
                            accept={PRESENTATION_MIME.join(",")}
                            variant="secondary"
                            disabled={pending || laeuft !== null}
                            onFile={(file) => void hochladen(z, s, file)}
                          />
                        ) : (
                          <span className="ct-help">{t.noProfile}</span>
                        )}
                        {fehler[key] && (
                          <p role="alert" className="ct-small text-error-ink">
                            {fehler[key]}
                          </p>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              });
            })}
          </Tbody>
        </Table>
      )}
      <p className="ct-help">{t.rules}</p>
    </div>
  );
}
