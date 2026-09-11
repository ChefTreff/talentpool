"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { updateMyVolunteerProfile } from "./actions";
import type { EventDay, VolunteerProfile } from "./types";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = {
  applied: "accent",
  accepted: "success",
  declined: "neutral",
  withdrawn: "neutral",
};

export function ProfileView({
  profile,
  days,
  shirtSizes,
  areas,
  locale,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  profile: VolunteerProfile;
  days: EventDay[];
  shirtSizes: Record<string, string>;
  areas: Record<string, string>;
  locale: string;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [askWithdraw, setAskWithdraw] = useState(false);
  const [draft, setDraft] = useState({
    shirt_size: profile.shirt_size ?? "",
    areas: profile.areas,
    day_prefs: profile.day_prefs,
    availability: typeof profile.availability?.note === "string" ? profile.availability.note : "",
    buddy_note: profile.buddy_note ?? "",
  });

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const dayLabel = (d: EventDay) =>
    (locale === "en" ? d.label_en : d.label_de) ??
    new Intl.DateTimeFormat(dateLocale, { dateStyle: "full" }).format(new Date(d.day_date));
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  const editable = profile.status === "applied" || profile.status === "accepted";

  function run(action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) {
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown") + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", okText);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={TONE[profile.status] ?? "neutral"}>
            {t[`status_${profile.status}`] ?? profile.status}
          </Badge>
          <span className="ct-help">
            {t.appliedOn} {dateTime.format(new Date(profile.applied_at))}
          </span>
        </div>
        <p className="ct-help mt-2">{t[`statusBody_${profile.status}`] ?? ""}</p>
        {/* Die Notiz gehört zur Entscheidung des Teams. Nach einem Rückzug
            gilt die nicht mehr — dann stünde dort „willkommen" über einer
            zurückgezogenen Bewerbung. */}
        {profile.decision_note &&
          (profile.status === "accepted" || profile.status === "declined") && (
            <p className="ct-help mt-1">{profile.decision_note}</p>
          )}
        {profile.status === "accepted" && (
          <p className="mt-3">
            <Link href="/volunteers/schichten" className="ct-link">
              {t.toShifts}
              {profile.shifts > 0 ? ` (${profile.shifts})` : ""}
            </Link>
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title={t.prefsTitle} description={t.prefsLead} />
        <div className="flex flex-col gap-4">
          {Object.keys(areas).length > 0 ? (
            <fieldset>
              <legend className="ct-label text-ink">{t.areas}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(areas).map(([key, label]) => (
                  <label key={key} className="ct-label flex items-center gap-2 text-ink">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      disabled={!editable}
                      checked={draft.areas.includes(key)}
                      onChange={() => setDraft((d) => ({ ...d, areas: toggle(d.areas, key) }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="ct-help">{t.areasPending}</p>
          )}

          {days.length > 0 && (
            <fieldset>
              <legend className="ct-label text-ink">{t.days}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {days.map((d) => (
                  <label key={d.id} className="ct-label flex items-center gap-2 text-ink">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      disabled={!editable}
                      checked={draft.day_prefs.includes(d.id)}
                      onChange={() =>
                        setDraft((prev) => ({ ...prev, day_prefs: toggle(prev.day_prefs, d.id) }))
                      }
                    />
                    {dayLabel(d)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <Field label={t.availability} htmlFor="p-av" hint={t.availabilityHint}>
            <Textarea
              id="p-av"
              rows={2}
              disabled={!editable}
              value={draft.availability}
              onChange={(e) => setDraft((d) => ({ ...d, availability: e.target.value }))}
            />
          </Field>
          <Field label={t.shirt} htmlFor="p-shirt">
            <Select
              id="p-shirt"
              className="w-40"
              disabled={!editable}
              value={draft.shirt_size}
              placeholder={t.noChoice}
              options={Object.entries(shirtSizes).map(([value, label]) => ({ value, label }))}
              onChange={(e) => setDraft((d) => ({ ...d, shirt_size: e.target.value }))}
            />
          </Field>
          <Field label={t.buddy} htmlFor="p-buddy" hint={t.buddyHint}>
            <Input
              id="p-buddy"
              disabled={!editable}
              value={draft.buddy_note}
              onChange={(e) => setDraft((d) => ({ ...d, buddy_note: e.target.value }))}
            />
          </Field>
        </div>

        {editable && (
          <div className="mt-6 flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  updateMyVolunteerProfile({
                    shirtSize: draft.shirt_size || null,
                    areas: draft.areas,
                    dayPrefs: draft.day_prefs,
                    availability: draft.availability,
                    buddyNote: draft.buddy_note,
                  }),
                  t.saved,
                )
              }
            >
              {common.save}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setAskWithdraw(true)}>
              {t.withdraw}
            </Button>
          </div>
        )}
      </Card>

      {askWithdraw && (
        <ConfirmDialog
          title={t.withdrawTitle}
          body={t.withdrawBody}
          confirmLabel={t.withdraw}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskWithdraw(false)}
          onConfirm={() => {
            setAskWithdraw(false);
            run(updateMyVolunteerProfile({ withdraw: true }), t.withdrawn);
          }}
        />
      )}
    </div>
  );
}
