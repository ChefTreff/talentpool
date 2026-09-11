"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBytes } from "@/lib/partner/file-rules";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { BUCKET } from "../upload";
import type { DeliverableAsset } from "../types";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = {
  pending: "accent",
  accepted: "success",
  rejected: "error",
};

export type FileRow = DeliverableAsset & {
  /** Art des Uploads = Schlüssel der Pflicht (`logo_vector`, `backdrop_print`, …). */
  kind: string;
  /** Ersetzte Fassungen bleiben lesbar, sind aber nicht mehr die aktuelle. */
  is_current: boolean;
  deliverableLabel: string;
};

export function FileList({
  rows,
  dateLocale,
  t,
  common,
}: {
  rows: FileRow[];
  dateLocale: string;
  t: Strings;
  common: { none: string };
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  /**
   * Der Bucket ist privat. Zum Öffnen zeichnet der Session-Client eine URL,
   * die eine Minute gilt — die Datei liegt nie öffentlich.
   */
  async function onOpen(row: FileRow) {
    setBusy(row.id);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(row.storage_path, 60);
      if (error || !data?.signedUrl) {
        toast("error", t.downloadFailed);
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Table>
      <Thead>
        <Th>{t.colFile}</Th>
        <Th>{t.colFor}</Th>
        <Th>{t.colStatus}</Th>
        <Th>{t.colUploaded}</Th>
      </Thead>
      <Tbody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td>
              <button
                type="button"
                disabled={busy === row.id}
                onClick={() => onOpen(row)}
                className="ct-link text-left"
              >
                {row.filename ?? row.storage_path.split("/").pop()}
              </button>
              <div className="ct-help">
                v{row.version}
                {!row.is_current && ` · ${t.replaced}`}
                {row.size_bytes != null && ` · ${formatBytes(row.size_bytes)}`}
              </div>
            </Td>
            <Td className="text-muted">{row.deliverableLabel}</Td>
            <Td>
              <Badge tone={TONE[row.status] ?? "neutral"}>
                {t[`asset_${row.status}`] ?? row.status}
              </Badge>
            </Td>
            <Td className="text-muted tabular-nums">
              {dateTime.format(new Date(row.created_at))}
            </Td>
          </Tr>
        ))}
        {rows.length === 0 && (
          <Tr>
            <Td className="text-muted">{common.none}</Td>
            <Td />
            <Td />
            <Td />
          </Tr>
        )}
      </Tbody>
    </Table>
  );
}
