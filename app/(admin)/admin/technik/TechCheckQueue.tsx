"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { setTechCheck } from "../actions";

type Strings = Record<string, string>;

export type CheckAsset = {
  id: string;
  profile_id: string;
  session_id: string | null;
  kind: string;
  storage_path: string;
  filename: string | null;
  mime: string | null;
  size_bytes: number | null;
  version: number;
  is_current: boolean;
  late: boolean;
  tech_check_status: string;
  tech_check_note: string | null;
  slides_release: boolean;
  created_at: string;
};

/** Name und Session-Titel je Profil — kommt aus `manager_speakers`. */
export type SpeakerHint = { name: string; sessions: Record<string, string> };

const TONE: Record<string, BadgeTone> = {
  pending: "neutral",
  checked: "success",
  issue: "error",
};

export function TechCheckQueue({
  assets,
  speakers,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  assets: CheckAsset[];
  speakers: Record<string, SpeakerHint>;
  dateLocale: string;
  t: Strings;
  common: { none: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "short" });
  const note = (id: string) => notes[id] ?? "";

  function onSet(asset: CheckAsset, status: string) {
    startTransition(async () => {
      const res = await setTechCheck(asset.id, status, note(asset.id));
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", t.saved);
      router.refresh();
    });
  }

  /** Öffnen über eine signierte URL — der Bucket bleibt privat. */
  async function onOpen(asset: CheckAsset) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.storage
      .from("speaker-assets")
      .createSignedUrl(asset.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast("error", t.openFailed);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <Table>
      <Thead>
        <Th>{t.colSpeaker}</Th>
        <Th>{t.colFile}</Th>
        <Th>{t.colUploaded}</Th>
        <Th>{t.colStatus}</Th>
        <Th>{t.colNote}</Th>
        <Th aria-label={t.colAction} />
      </Thead>
      <Tbody>
        {assets.map((a) => (
          <Tr key={a.id}>
            <Td>
              {speakers[a.profile_id]?.name || common.none}
              {a.session_id && speakers[a.profile_id]?.sessions[a.session_id] && (
                <div className="ct-help">{speakers[a.profile_id].sessions[a.session_id]}</div>
              )}
            </Td>
            <Td>
              <button type="button" onClick={() => onOpen(a)} className="ct-link text-left">
                {a.filename ?? a.storage_path.split("/").pop()}
              </button>
              <div className="ct-help">
                v{a.version}
                {a.late && ` · ${t.late}`}
                {a.slides_release && ` · ${t.slidesRelease}`}
              </div>
            </Td>
            <Td className="text-muted tabular-nums">
              {dateTime.format(new Date(a.created_at))}
            </Td>
            <Td>
              <Badge tone={TONE[a.tech_check_status] ?? "neutral"}>
                {t[`check_${a.tech_check_status}`] ?? a.tech_check_status}
              </Badge>
            </Td>
            <Td>
              <Input
                aria-label={t.colNote}
                value={note(a.id) || a.tech_check_note || ""}
                onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
              />
            </Td>
            <Td>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={pending} onClick={() => onSet(a, "checked")}>
                  {t.markChecked}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending || (note(a.id) || a.tech_check_note || "").trim() === ""}
                  onClick={() => onSet(a, "issue")}
                >
                  {t.markIssue}
                </Button>
              </div>
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
