"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { zonedTimeToInstant } from "@/lib/tz";
import { createFormatSession, deleteFormatSession, updateFormatSession } from "../actions";
import { EVENT_TZ, type PartnerDay, type PartnerStage } from "../formate";
import type { PartnerFormatSession } from "../talk/types";

type Strings = Record<string, string>;

function uhrzeitInMinuten(wert: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(wert.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

/**
 * Side-Events anlegen und füllen (PART-047).
 *
 * Der Partner legt hier selbst an — deshalb steht die **Freigabe** sichtbar an
 * jedem Eintrag: bis das Team sie erteilt, steht das Side-Event nicht im
 * Programm (D2). Das ist keine Fußnote, sondern der Unterschied zwischen
 * „eingetragen" und „findet statt".
 *
 * Eine Änderung an Titel oder Beschreibung eines **freigegebenen** Eintrags
 * schickt ihn zurück in die Prüfung. Die Antwort der RPC sagt das, und der
 * Toast gibt es weiter — sonst verschwände der Eintrag aus dem Programm und
 * niemand wüsste, warum.
 */
export function SideEventView({
  orgId,
  editionId,
  sessions,
  stages,
  days,
  canEdit,
  frei,
  statusLabel,
  locale,
  t,
  rpcMessages,
}: {
  orgId: string;
  editionId: string;
  sessions: PartnerFormatSession[];
  stages: PartnerStage[];
  days: PartnerDay[];
  canEdit: boolean;
  /** Noch offener Anspruch aus den gebuchten Produkten. */
  frei: number;
  statusLabel: Record<string, string>;
  locale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSaving] = useTransition();
  const [neuOffen, setNeuOffen] = useState(false);
  const [loeschen, setLoeschen] = useState<PartnerFormatSession | null>(null);
  const [neu, setNeu] = useState({
    title: "",
    stageId: stages[0]?.id ?? "",
    dayId: "",
    von: "18:00",
    bis: "21:00",
    ort: "",
  });
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", beschreibung: "", ort: "" });

  const tageDerFlaeche = (stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    return stage ? days.filter((d) => d.event_id === stage.event_id) : [];
  };

  function anlegen() {
    const vonMin = uhrzeitInMinuten(neu.von);
    const bisMin = uhrzeitInMinuten(neu.bis);
    const tag = days.find((d) => d.id === neu.dayId);
    if (!tag || vonMin === null || bisMin === null || vonMin >= bisMin) {
      toast("error", t.timeInvalid);
      return;
    }
    startSaving(async () => {
      const res = await createFormatSession({
        orgId,
        editionId,
        format: "side_event",
        stageId: neu.stageId,
        dayId: neu.dayId,
        start: zonedTimeToInstant(tag.day_date, vonMin, EVENT_TZ).toISOString(),
        end: zonedTimeToInstant(tag.day_date, bisMin, EVENT_TZ).toISOString(),
        titleDe: neu.title,
        capacity: null,
        details: neu.ort.trim() ? { location_text: neu.ort.trim() } : {},
      });
      if (!res.ok) {
        toast("error", rpcMessages[res.key] ?? rpcMessages.unknown);
        return;
      }
      toast("success", t.created);
      setNeu({ ...neu, title: "", ort: "" });
      setNeuOffen(false);
      router.refresh();
    });
  }

  function speichern(x: PartnerFormatSession) {
    startSaving(async () => {
      const res = await updateFormatSession({
        sessionId: x.id,
        fields: {
          title_de: draft.title.trim() || null,
          description_de: draft.beschreibung.trim() || null,
          format_details: { location_text: draft.ort.trim() || null },
        },
      });
      if (!res.ok) {
        toast("error", rpcMessages[res.key] ?? rpcMessages.unknown);
        return;
      }
      // Die RPC sagt, ob die Änderung zurück in die Prüfung geht.
      toast("success", res.data.back_to_review ? t.savedBackToReview : t.saved);
      setBearbeitet(null);
      router.refresh();
    });
  }

  function entfernen(x: PartnerFormatSession) {
    startSaving(async () => {
      const res = await deleteFormatSession({ sessionId: x.id });
      setLoeschen(null);
      if (!res.ok) {
        toast("error", rpcMessages[res.key] ?? rpcMessages.unknown);
        return;
      }
      toast("success", t.deleted);
      router.refresh();
    });
  }

  const zeit = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: EVENT_TZ,
  });

  return (
    <div className="flex flex-col gap-4">
      {sessions.map((x) => {
        const ort = (x.format_details?.location_text as string | undefined) ?? null;
        const offen = bearbeitet === x.id;
        return (
          <div key={x.id} className="rounded-ct-md border border-border bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="ct-h3 text-ink">{x.title_de ?? t.untitled}</h2>
              <Badge tone={x.publish_status === "published" ? "success" : "neutral"}>
                {statusLabel[x.publish_status] ?? x.publish_status}
              </Badge>
            </div>
            <p className="ct-help mt-1">
              {x.starts_at ? zeit.format(new Date(x.starts_at)) : t.timePending}
              {ort ? ` · ${ort}` : ""}
            </p>
            {x.publish_status !== "published" && <p className="ct-help mt-2">{t.needsRelease}</p>}

            {canEdit && !offen && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setBearbeitet(x.id);
                    setDraft({
                      title: x.title_de ?? "",
                      beschreibung: x.description_de ?? "",
                      ort: ort ?? "",
                    });
                  }}
                >
                  {t.edit}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setLoeschen(x)}>
                  {t.delete}
                </Button>
              </div>
            )}

            {canEdit && offen && (
              <div className="mt-4 flex flex-col gap-4">
                <Field label={t.titleLabel} htmlFor={`t-${x.id}`}>
                  <Input
                    id={`t-${x.id}`}
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  />
                </Field>
                <Field label={t.descriptionLabel} htmlFor={`d-${x.id}`}>
                  <Textarea
                    id={`d-${x.id}`}
                    rows={3}
                    value={draft.beschreibung}
                    onChange={(e) => setDraft({ ...draft, beschreibung: e.target.value })}
                  />
                </Field>
                <Field label={t.locationLabel} htmlFor={`o-${x.id}`} hint={t.locationHint}>
                  <Input
                    id={`o-${x.id}`}
                    value={draft.ort}
                    onChange={(e) => setDraft({ ...draft, ort: e.target.value })}
                  />
                </Field>
                {x.publish_status === "published" && (
                  <p className="ct-help">{t.editPublishedWarning}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => speichern(x)} disabled={saving}>
                    {saving ? t.saving : t.save}
                  </Button>
                  <Button variant="ghost" onClick={() => setBearbeitet(null)} disabled={saving}>
                    {t.cancel}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {canEdit && frei > 0 && !neuOffen && (
        <div>
          <Button onClick={() => setNeuOffen(true)}>{t.addSideEvent}</Button>
          <p className="ct-help mt-2">{t.remaining.replace("{n}", String(frei))}</p>
        </div>
      )}
      {canEdit && frei <= 0 && sessions.length > 0 && <p className="ct-help">{t.noneLeft}</p>}

      {canEdit && neuOffen && (
        <div className="rounded-ct-md border border-border bg-surface p-5">
          <h2 className="ct-h2 text-ink">{t.addSideEvent}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t.titleLabel} htmlFor="neu-titel">
              <Input
                id="neu-titel"
                value={neu.title}
                onChange={(e) => setNeu({ ...neu, title: e.target.value })}
              />
            </Field>
            <Field label={t.dayLabel} htmlFor="neu-tag">
              <Select
                id="neu-tag"
                value={neu.dayId}
                onChange={(e) => setNeu({ ...neu, dayId: e.target.value })}
                options={[
                  { value: "", label: t.dayPlaceholder },
                  ...tageDerFlaeche(neu.stageId).map((d) => ({
                    value: d.id,
                    label: (locale === "en" ? d.label_en : d.label_de) ?? d.day_date,
                  })),
                ]}
              />
            </Field>
            <Field label={t.fromLabel} htmlFor="neu-von">
              <Input
                id="neu-von"
                type="time"
                value={neu.von}
                onChange={(e) => setNeu({ ...neu, von: e.target.value })}
              />
            </Field>
            <Field label={t.toLabel} htmlFor="neu-bis">
              <Input
                id="neu-bis"
                type="time"
                value={neu.bis}
                onChange={(e) => setNeu({ ...neu, bis: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label={t.locationLabel} htmlFor="neu-ort" hint={t.locationHint}>
              <Input
                id="neu-ort"
                value={neu.ort}
                onChange={(e) => setNeu({ ...neu, ort: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={anlegen} disabled={saving || !neu.title.trim() || !neu.dayId}>
              {saving ? t.saving : t.create}
            </Button>
            <Button variant="ghost" onClick={() => setNeuOffen(false)} disabled={saving}>
              {t.cancel}
            </Button>
          </div>
          <p className="ct-help mt-3">{t.createNote}</p>
        </div>
      )}

      {loeschen && (
        <ConfirmDialog
          title={t.deleteTitle}
          body={t.deleteBody}
          detail={<p className="ct-label">{loeschen.title_de ?? t.untitled}</p>}
          confirmLabel={t.delete}
          cancelLabel={t.cancel}
          pending={saving}
          onCancel={() => setLoeschen(null)}
          onConfirm={() => entfernen(loeschen)}
        />
      )}
    </div>
  );
}
