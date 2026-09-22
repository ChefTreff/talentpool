"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { createFormatSession, deleteFormatSession, setInterviewPosting } from "../actions";
import { EVENT_TZ, MAX_SLOTS, rechneSlots, type PartnerDay, type PartnerStage } from "../formate";
import type { PartnerFormatSession } from "../talk/types";

type Strings = Record<string, string>;
type VokabularOption = { key: string; label: string };

/**
 * Interview Tables (PART-048, ehem. Speed-Dating).
 *
 * Drei Teile, in der Reihenfolge, in der ein Partner sie braucht:
 *
 * 1. **Gespräche anlegen.** Nicht einzeln, sondern als Zeitfenster mit Länge
 *    (Konrad, 17.09.: „Tag, Beginn, Ende, Länge"). Zwanzig Gespräche von Hand
 *    einzutragen wäre die Art Arbeit, für die es ein Portal gibt.
 * 2. **Die Ausschreibung.** Sie hängt im Datenmodell an jedem einzelnen
 *    Gespräch — richtig, denn an einem zweiten Tisch könnte eine andere Stelle
 *    besetzt werden. Hier wird sie **einmal** eingegeben und auf alle
 *    Gespräche dieses Tisches verteilt.
 * 3. **Die Bewerbungen**, über den bestehenden Bereich.
 *
 * Die Vorschau vor dem Anlegen ist kein Schmuck: Wer sich bei der Länge
 * vertippt, sieht es an der Zahl, bevor vierzig Slots entstehen, die er
 * einzeln wieder löschen müsste.
 */
export function TischeView({
  orgId,
  editionId,
  tisch,
  sessions,
  days,
  canEdit,
  profilFelder,
  statusLabel,
  locale,
  t,
  rpcMessages,
}: {
  orgId: string;
  editionId: string;
  tisch: PartnerStage;
  sessions: PartnerFormatSession[];
  days: PartnerDay[];
  canEdit: boolean;
  /** Dieselben Auswahlfelder wie im Teilnehmerprofil (D1). */
  profilFelder: Record<"occupation_status" | "career_level" | "study_field", VokabularOption[]>;
  statusLabel: Record<string, string>;
  locale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSaving] = useTransition();
  const [loeschen, setLoeschen] = useState<PartnerFormatSession | null>(null);

  const ersteDetails = sessions[0]?.format_details ?? {};
  const [plan, setPlan] = useState({
    dayId: days[0]?.id ?? "",
    von: "10:00",
    bis: "12:00",
    laenge: String(tisch.default_duration_min ?? 20),
  });
  const [posting, setPosting] = useState({
    job_title: (ersteDetails.job_title as string) ?? "",
    job_posting_text: (ersteDetails.job_posting_text as string) ?? "",
    job_posting_url: (ersteDetails.job_posting_url as string) ?? "",
    interview_mode: (ersteDetails.interview_mode as string) ?? "single",
  });
  const [profil, setProfil] = useState<Record<string, string[]>>(
    (ersteDetails.target_profile as Record<string, string[]>) ?? {},
  );

  const tag = days.find((d) => d.id === plan.dayId);
  const vorschau = tag
    ? rechneSlots(tag.day_date, plan.von, plan.bis, Number(plan.laenge))
    : [];

  function anlegen() {
    if (!tag || vorschau.length === 0) {
      toast("error", t.planInvalid);
      return;
    }
    startSaving(async () => {
      let gebaut = 0;
      let schlecht = 0;
      let ersterFehler: string | undefined;
      for (const slot of vorschau) {
        const res = await createFormatSession({
          orgId,
          editionId,
          format: "interview_table",
          stageId: tisch.id,
          dayId: plan.dayId,
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
          titleDe: posting.job_title.trim() || t.defaultTitle,
          capacity: 1,
          // Die Ausschreibung gleich mitgeben: sonst stünde ein frisch
          // angelegtes Gespräch ohne Inhalt in der Liste.
          details: aktuelleDetails(),
        });
        if (res.ok) gebaut += 1;
        else {
          schlecht += 1;
          ersterFehler ??= res.key;
        }
      }
      if (gebaut === 0) {
        toast("error", rpcMessages[ersterFehler ?? "unknown"] ?? rpcMessages.unknown);
        return;
      }
      // Teilerfolg wird als Teilerfolg gemeldet, nicht als Erfolg: sonst
      // suchte der Partner später nach Gesprächen, die es nicht gibt.
      toast(
        schlecht > 0 ? "info" : "success",
        schlecht > 0
          ? t.createdPartly.replace("{n}", String(gebaut)).replace("{f}", String(schlecht))
          : t.createdAll.replace("{n}", String(gebaut)),
      );
      router.refresh();
    });
  }

  function aktuelleDetails() {
    const details: Record<string, unknown> = { interview_mode: posting.interview_mode };
    if (posting.job_title.trim()) details.job_title = posting.job_title.trim();
    if (posting.job_posting_text.trim()) details.job_posting_text = posting.job_posting_text.trim();
    if (posting.job_posting_url.trim()) details.job_posting_url = posting.job_posting_url.trim();
    const gesucht = Object.fromEntries(
      Object.entries(profil).filter(([, v]) => v.length > 0),
    );
    if (Object.keys(gesucht).length > 0) details.target_profile = gesucht;
    return details;
  }

  function ausschreibungSpeichern() {
    if (sessions.length === 0) {
      toast("error", t.noSlotsYet);
      return;
    }
    startSaving(async () => {
      const res = await setInterviewPosting({
        sessionIds: sessions.map((x) => x.id),
        details: aktuelleDetails(),
      });
      if (!res.ok) {
        toast("error", rpcMessages[res.key] ?? rpcMessages.unknown);
        return;
      }
      const { updated, failed, firstKey } = res.data;
      toast(
        failed > 0 ? "info" : "success",
        failed > 0
          ? `${t.postingPartly.replace("{n}", String(updated)).replace("{f}", String(failed))} ${rpcMessages[firstKey ?? "unknown"] ?? ""}`.trim()
          : t.postingSaved.replace("{n}", String(updated)),
      );
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
      toast("success", t.slotDeleted);
      router.refresh();
    });
  }

  const zeit = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: EVENT_TZ,
  });
  const nurZeit = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: EVENT_TZ,
  });

  function toggleProfil(feld: string, key: string) {
    const jetzt = profil[feld] ?? [];
    setProfil({
      ...profil,
      [feld]: jetzt.includes(key) ? jetzt.filter((k) => k !== key) : [...jetzt, key],
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 1) Die Gespräche */}
      <section className="rounded-ct-md border border-border bg-surface p-5">
        <h2 className="ct-h3 text-ink">{t.slotsTitle}</h2>
        <p className="ct-small mt-1 leading-6">{t.slotsLead}</p>

        {sessions.length === 0 ? (
          <p className="ct-help mt-3">{t.noSlots}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {sessions.map((x) => (
              <li
                key={x.id}
                className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-b-0"
              >
                <span className="ct-small tabular-nums text-ink">
                  {x.starts_at ? zeit.format(new Date(x.starts_at)) : "—"}
                  {x.ends_at ? `–${nurZeit.format(new Date(x.ends_at))}` : ""}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={x.publish_status === "published" ? "success" : "neutral"}>
                    {statusLabel[x.publish_status] ?? x.publish_status}
                  </Badge>
                  <span className="ct-help">
                    {t.applications.replace("{n}", String(x.applications_total))}
                  </span>
                  {canEdit && x.applications_accepted === 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setLoeschen(x)}>
                      {t.delete}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="mt-5 border-t border-border pt-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label={t.dayLabel} htmlFor="plan-tag">
                <Select
                  id="plan-tag"
                  value={plan.dayId}
                  onChange={(e) => setPlan({ ...plan, dayId: e.target.value })}
                  options={days.map((d) => ({
                    value: d.id,
                    label: (locale === "en" ? d.label_en : d.label_de) ?? d.day_date,
                  }))}
                />
              </Field>
              <Field label={t.fromLabel} htmlFor="plan-von">
                <Input
                  id="plan-von"
                  type="time"
                  value={plan.von}
                  onChange={(e) => setPlan({ ...plan, von: e.target.value })}
                />
              </Field>
              <Field label={t.toLabel} htmlFor="plan-bis">
                <Input
                  id="plan-bis"
                  type="time"
                  value={plan.bis}
                  onChange={(e) => setPlan({ ...plan, bis: e.target.value })}
                />
              </Field>
              <Field label={t.lengthLabel} htmlFor="plan-laenge" hint={t.lengthHint}>
                <Input
                  id="plan-laenge"
                  type="number"
                  min={5}
                  max={240}
                  value={plan.laenge}
                  onChange={(e) => setPlan({ ...plan, laenge: e.target.value })}
                />
              </Field>
            </div>
            <p className="ct-help mt-3">
              {vorschau.length === 0
                ? t.previewNone
                : t.preview
                    .replace("{n}", String(vorschau.length))
                    .replace("{von}", nurZeit.format(vorschau[0].start))
                    .replace("{bis}", nurZeit.format(vorschau[vorschau.length - 1].end))}
              {vorschau.length === MAX_SLOTS ? ` ${t.previewCapped}` : ""}
            </p>
            <div className="mt-3">
              <Button onClick={anlegen} disabled={saving || vorschau.length === 0}>
                {saving ? t.saving : t.createSlots}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* 2) Die Ausschreibung */}
      <section className="rounded-ct-md border border-border bg-surface p-5">
        <h2 className="ct-h3 text-ink">{t.postingTitle}</h2>
        <p className="ct-small mt-1 leading-6">{t.postingLead}</p>

        <div className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.jobTitleLabel} htmlFor="p-titel">
              <Input
                id="p-titel"
                value={posting.job_title}
                disabled={!canEdit}
                onChange={(e) => setPosting({ ...posting, job_title: e.target.value })}
              />
            </Field>
            <Field label={t.jobUrlLabel} htmlFor="p-url" hint={t.jobUrlHint}>
              <Input
                id="p-url"
                type="url"
                value={posting.job_posting_url}
                disabled={!canEdit}
                onChange={(e) => setPosting({ ...posting, job_posting_url: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t.jobTextLabel} htmlFor="p-text">
            <Textarea
              id="p-text"
              rows={5}
              value={posting.job_posting_text}
              disabled={!canEdit}
              onChange={(e) => setPosting({ ...posting, job_posting_text: e.target.value })}
            />
          </Field>
          <Field label={t.modeLabel} htmlFor="p-modus" hint={t.modeHint}>
            <Select
              id="p-modus"
              value={posting.interview_mode}
              disabled={!canEdit}
              onChange={(e) => setPosting({ ...posting, interview_mode: e.target.value })}
              options={[
                { value: "single", label: t.modeSingle },
                { value: "group", label: t.modeGroup },
              ]}
            />
          </Field>

          <div>
            <h3 className="ct-label text-ink">{t.profileTitle}</h3>
            <p className="ct-help mt-1">{t.profileHint}</p>
            <div className="mt-3 flex flex-col gap-3">
              {(["occupation_status", "career_level", "study_field"] as const).map((feld) => (
                <fieldset key={feld}>
                  <legend className="ct-help">{t[`profile_${feld}`]}</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {profilFelder[feld].map((o) => {
                      const an = (profil[feld] ?? []).includes(o.key);
                      return (
                        <label
                          key={o.key}
                          // Der ausgewählte Zustand kommt aus React, nicht aus
                          // `has-[:checked]:` — die Variante nutzt sonst niemand
                          // im Repo, und ein Stil, den ich nicht im Browser
                          // prüfen kann, soll nicht die einzige Rückmeldung sein.
                          className={cn(
                            "ct-small inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-ct-sm border px-3 py-2 text-ink",
                            an ? "border-border-strong bg-canvas" : "border-border",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={an}
                            disabled={!canEdit}
                            onChange={() => toggleProfil(feld, o.key)}
                          />
                          {o.label}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>

          {canEdit && (
            <div>
              <Button onClick={ausschreibungSpeichern} disabled={saving || sessions.length === 0}>
                {saving ? t.saving : t.savePosting}
              </Button>
              <p className="ct-help mt-2">
                {sessions.length === 0 ? t.noSlotsYet : t.postingAppliesTo.replace("{n}", String(sessions.length))}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 3) Die Bewerbungen */}
      <section className="rounded-ct-md border border-border bg-surface p-5">
        <h2 className="ct-h3 text-ink">{t.applicantsTitle}</h2>
        <p className="ct-small mt-1 leading-6">{t.applicantsLead}</p>
        <p className="mt-3">
          <Link href="/partner/bewerber" className="ct-link">
            {t.toApplicants}
          </Link>
        </p>
      </section>

      {loeschen && (
        <ConfirmDialog
          title={t.deleteTitle}
          body={t.deleteBody}
          detail={
            <p className="ct-label tabular-nums">
              {loeschen.starts_at ? zeit.format(new Date(loeschen.starts_at)) : "—"}
            </p>
          }
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
