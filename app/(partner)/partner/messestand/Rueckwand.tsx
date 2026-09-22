"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { acceptAttribute, checkFileRules, formatBytes } from "@/lib/partner/file-rules";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DeadlineCard } from "@/components/ui/DeadlineCard";
import { Field } from "@/components/ui/Field";
import { FileButton } from "@/components/ui/FileButton";
import { Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { registerPartnerAsset, shopRequestProduct, submitDeliverable } from "../actions";
import { uploadDeliverableFile } from "../upload";
import type { Deliverable, PartnerOverview } from "../types";

type Strings = Record<string, string>;

/**
 * Die Rückwand: erklären, hochladen, Frist zeigen — und nach der Frist einen
 * Weg lassen.
 *
 * Konrads Vorlage sagte „ab dem 13.03. bitte per Mail an Konrad". Ein
 * Mail-Rückfall aus einem Portal heraus ist immer ein Bruch: die Datei landet
 * dann neben allem, was das System weiss. Deshalb wird daraus ein
 * **Änderungswunsch im Portal** (Entscheid 3 der Architektur-Session) — er
 * landet in derselben Anfrage-Liste, die das Partner-Team ohnehin abarbeitet.
 *
 * Es ist derselbe Upload wie in der Checkliste, nicht eine zweite Ablage: er
 * hängt an derselben Pflicht (`backdrop_print`), also sieht das Team eine Datei
 * und nicht zwei.
 */
export function Rueckwand({
  orgId,
  editionId,
  deliverable,
  booth,
  dueAt,
  canEdit,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  orgId: string;
  editionId: string;
  deliverable: Deliverable | null;
  booth: PartnerOverview["booth"];
  dueAt: string | null;
  canEdit: boolean;
  dateLocale: string;
  t: Strings;
  common: { save: string; cancel: string; upload: string; chooseOtherFile: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [wunsch, setWunsch] = useState<string | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "long", timeStyle: "short" });
  const abgelaufen = dueAt !== null && new Date(dueAt) < new Date();
  const rules = deliverable?.file_rules ?? null;
  const dateien = deliverable?.assets ?? [];

  async function onUpload(file: File) {
    if (!deliverable) return;
    const bad = checkFileRules(file, rules);
    if (bad) {
      const allowed = (rules?.ext ?? []).map((e) => `.${e}`).join(", ");
      toast(
        "error",
        bad.reason === "size"
          ? t.uploadTooBig.replace("{max}", bad.detail)
          : t.uploadWrongType.replace("{allowed}", allowed).replace("{got}", bad.detail),
      );
      return;
    }
    setUploading(true);
    try {
      const res = await uploadDeliverableFile({
        supabase: createSupabaseBrowserClient(),
        registerAsset: registerPartnerAsset,
        submit: submitDeliverable,
        orgId,
        editionId,
        deliverableId: deliverable.id,
        kind: deliverable.key,
        file,
      });
      if (!res.ok) {
        toast(
          "error",
          res.stage === "storage"
            ? `${t.uploadFailed} (${res.message})`
            : message(res.key) + (res.detail ? ` (${res.detail})` : ""),
        );
        return;
      }
      toast("success", t.uploaded.replace("{v}", String(res.version)));
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  function sendeWunsch() {
    const text = (wunsch ?? "").trim();
    if (text === "") return;
    startTransition(async () => {
      const res = await shopRequestProduct({
        orgId,
        // Der Betreff steht im Text: die Anfrageliste kennt keine Kategorie,
        // und das Partner-Team soll auf einen Blick sehen, worum es geht.
        text: `${t.changeRequest} · ${t.backTitle}: ${text}`,
      });
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.changeRequestSent);
      setWunsch(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="ct-small leading-6">{t.backBody}</p>

        <p className="ct-label mt-4 text-ink">
          {booth?.backdrop_w_mm && booth?.backdrop_h_mm
            ? t.backSize
                .replace("{w}", String(booth.backdrop_w_mm))
                .replace("{h}", String(booth.backdrop_h_mm))
            : t.backSizeSoon}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ButtonLink href="/partner/wiki" variant="secondary">
            {t.backToWiki}
          </ButtonLink>

          {!deliverable ? (
            <span className="ct-help">{t.backNone}</span>
          ) : !canEdit || abgelaufen ? null : (
            <FileButton
              uploadLabel={common.upload}
              changeLabel={common.chooseOtherFile}
              label={dateien.length > 0 ? t.backUploadNew : t.backUpload}
              accept={acceptAttribute(rules)}
              disabled={uploading}
              hint={t.uploadHint
                .replace("{allowed}", (rules?.ext ?? []).map((e) => `.${e}`).join(", "))
                .replace("{max}", formatBytes(rules?.max_bytes ?? 0))}
              onFile={(file) => void onUpload(file)}
            />
          )}
        </div>
        {uploading && <p className="ct-help mt-2">{t.uploading}</p>}

        {dateien.length > 0 && (
          <ul className="ct-help mt-4 flex flex-col gap-1">
            {dateien.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <Badge tone="success">{t.backCurrent}</Badge>
                <span>{a.filename ?? a.storage_path.split("/").pop()}</span>
                <span className="tabular-nums">v{a.version}</span>
                <span className="tabular-nums">{dateTime.format(new Date(a.created_at))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {dueAt && (
        <DeadlineCard
          dueAt={dueAt}
          label={t.dueOn}
          dateText={dateTime.format(new Date(dueAt))}
          days={t.countdownDays}
          hours={t.countdownHours}
          soon={t.countdownSoon}
          note={t.backAfterDeadline}
        />
      )}

      {/* Nach der Frist bleibt genau ein Weg — und der führt nicht in eine
          Mailbox, sondern in die Anfrageliste des Partner-Teams. */}
      {abgelaufen && canEdit && (
        <Card>
          {wunsch === null ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="ct-small min-w-0 flex-1 leading-6">{t.changeRequestHint}</p>
              <Button variant="secondary" onClick={() => setWunsch("")}>
                {t.changeRequest}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Field label={t.changeRequestLabel} htmlFor="wunsch" hint={t.changeRequestHint}>
                <Textarea
                  id="wunsch"
                  rows={4}
                  value={wunsch}
                  onChange={(e) => setWunsch(e.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button disabled={pending || wunsch.trim() === ""} onClick={sendeWunsch}>
                  {t.changeRequest}
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => setWunsch(null)}>
                  {common.cancel}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <p className="ct-help">
        <Link className="ct-link" href="/partner/checkliste">
          {t.inChecklist}
        </Link>
      </p>
    </div>
  );
}
