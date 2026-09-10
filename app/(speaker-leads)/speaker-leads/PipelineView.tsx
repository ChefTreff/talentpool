"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n/shared";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { cn } from "@/components/ui/cn";
import { NewSpeakerDrawer } from "./NewSpeakerDrawer";
import { SpeakerDrawer } from "./SpeakerDrawer";
import { PIPELINE_ORDER, type ManagedSpeaker, type ManagerScope } from "./types";

type Strings = Record<string, string>;

const PIPELINE_TONE: Record<string, BadgeTone> = {
  lead: "neutral",
  contacted: "neutral",
  confirmed: "accent",
  onboarded: "accent",
  ready: "success",
  published: "success",
  attended: "success",
  declined: "error",
};

export function PipelineView({
  scope,
  speakers,
  isStaff,
  labels,
  locale,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  scope: ManagerScope;
  speakers: ManagedSpeaker[];
  isStaff: boolean;
  labels: Record<string, Record<string, string>>;
  locale: Locale;
  dateLocale: string;
  t: Strings;
  common: {
    cancel: string;
    choose: string;
    close: string;
    none: string;
    required: string;
    save: string;
  };
  rpcMessages: Record<string, string>;
}) {
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "short" });
  const name = (s: ManagedSpeaker) =>
    [s.title, s.first_name, s.last_name].filter(Boolean).join(" ") || common.none;

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return speakers
      .filter((s) => (!status || s.pipeline_status === status))
      .filter(
        (s) =>
          !term ||
          [s.first_name, s.last_name, s.organization_name, s.job_title, s.email]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(term)),
      )
      .sort(
        (a, b) =>
          PIPELINE_ORDER.indexOf(a.pipeline_status) -
            PIPELINE_ORDER.indexOf(b.pipeline_status) ||
          (a.last_name ?? "").localeCompare(b.last_name ?? ""),
      );
  }, [query, speakers, status]);

  // Zähler je Stand — der Überblick, den ein Lead zuerst braucht.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of speakers) m.set(s.pipeline_status, (m.get(s.pipeline_status) ?? 0) + 1);
    return m;
  }, [speakers]);

  const selected = speakers.find((s) => s.id === openId) ?? null;
  // Die Edition für „Speaker anlegen" und die Board-Vorauswahl: bei genau einer
  // im Scope ist sie gesetzt, sonst wählt man sie im Formular.
  const editions = scope.editions;

  return (
    <div className="flex flex-col gap-4">
      {/* Zähler je Pipeline-Stand */}
      <div className="flex flex-wrap gap-1" role="group" aria-label={t.filterStatus}>
        <button
          type="button"
          aria-pressed={status === ""}
          onClick={() => setStatus("")}
          className={cn(
            "rounded-ct-sm px-2.5 py-1.5 text-[14px] font-semibold",
            status === ""
              ? "bg-accent-soft text-accent-deep"
              : "text-muted hover:bg-surface-hover hover:text-ink",
          )}
        >
          {t.allStatuses} ({speakers.length})
        </button>
        {PIPELINE_ORDER.filter((s) => counts.has(s)).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-ct-sm px-2.5 py-1.5 text-[14px] font-semibold",
              status === s
                ? "bg-accent-soft text-accent-deep"
                : "text-muted hover:bg-surface-hover hover:text-ink",
            )}
          >
            {labels.pipeline[s] ?? s} ({counts.get(s)})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label={t.search} htmlFor="lead-search" className="min-w-[260px]">
          <Input
            id="lead-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          {/* Das Board liegt im Admin-Bereich; wer da nicht hinein darf, sieht
              den Link nicht (statt in ein 404 zu laufen). */}
          {isStaff && editions.length > 0 && (
            <Link href="/admin/programm" className="ct-link text-[14px]">
              {t.toBoard}
            </Link>
          )}
          <Button size="sm" onClick={() => setCreating(true)}>
            {t.newSpeaker}
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title={t.noMatchTitle} description={t.noMatchBody} />
      ) : (
        <Table>
          <Thead>
            <Th>{t.colName}</Th>
            <Th>{t.colRole}</Th>
            <Th>{t.colStatus}</Th>
            <Th>{t.colSessions}</Th>
            <Th>{t.colOpen}</Th>
            <Th>{t.colOwner}</Th>
          </Thead>
          <Tbody>
            {visible.map((s) => (
              <Tr key={s.id}>
                <Td>
                  <button
                    type="button"
                    onClick={() => setOpenId(s.id)}
                    className="ct-link text-left"
                  >
                    {name(s)}
                  </button>
                  <div className="ct-help">
                    {[s.job_title, s.organization_name].filter(Boolean).join(" · ")}
                  </div>
                </Td>
                <Td className="text-muted">
                  {labels.speakerType[s.speaker_type] ?? s.speaker_type}
                </Td>
                <Td>
                  <Badge tone={PIPELINE_TONE[s.pipeline_status] ?? "neutral"}>
                    {labels.pipeline[s.pipeline_status] ?? s.pipeline_status}
                  </Badge>
                  {s.invited_at && (
                    <div className="ct-help">
                      {t.invitedOn} {dateTime.format(new Date(s.invited_at))}
                    </div>
                  )}
                </Td>
                <Td className="text-muted">
                  {(s.sessions ?? []).length === 0 ? (
                    <span className="ct-help">{t.noSession}</span>
                  ) : (
                    (s.sessions ?? []).map((se) => (
                      <div key={se.session_id}>
                        {(locale === "en" ? se.title_en : se.title_de) ?? se.title_de ?? "—"}
                      </div>
                    ))
                  )}
                </Td>
                <Td>
                  {(s.next_open ?? []).length === 0 ? (
                    <Badge tone="success">{t.allDone}</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {(s.next_open ?? []).map((step) => (
                        <Badge key={step}>{t[`step_${step}`] ?? step}</Badge>
                      ))}
                    </div>
                  )}
                </Td>
                <Td className="text-muted">{s.owner_name || common.none}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {selected && (
        <SpeakerDrawer
          key={selected.id}
          speaker={selected}
          isTeam={scope.team}
          labels={labels}
          locale={locale}
          dateLocale={dateLocale}
          t={t}
          common={common}
          rpcMessages={rpcMessages}
          onClose={() => setOpenId(null)}
        />
      )}

      {creating && (
        <NewSpeakerDrawer
          editions={editions}
          speakerTypes={labels.speakerType}
          canSearchPeople={scope.team}
          t={t}
          common={common}
          rpcMessages={rpcMessages}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
