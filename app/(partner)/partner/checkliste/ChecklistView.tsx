"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  acceptAttribute,
  formatBytes,
  type FileRules,
} from "@/lib/partner/file-rules";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CheckMark } from "@/components/ui/CheckMark";
import { Field } from "@/components/ui/Field";
import { FileButton } from "@/components/ui/FileButton";
import { FristMarke, type FristTexte } from "@/components/ui/FristMarke";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { orderLunchPackage, submitDeliverable } from "../actions";
import { usePflichtUpload } from "../UploadKachel";
import { BUCKET } from "../upload";
import type { AnswerField, Deliverable, DeliverableAsset, PartnerOverview } from "../types";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = {
  open: "neutral",
  submitted: "accent",
  accepted: "success",
  rejected: "error",
  overdue: "warning",
};

/** Status, in denen die Partnerseite noch etwas tun kann (wie `submit_deliverable`). */
const EDITABLE = new Set(["open", "rejected", "overdue"]);

export type ChecklistGroup = {
  /** `null` = gilt für alle, unabhängig von einer Leistung. */
  sku: string | null;
  label: string;
  items: Deliverable[];
};

export function ChecklistView({
  orgId,
  editionId,
  groups,
  booth,
  canEdit,
  variant = "gruppen",
  fristTexte,
  locale,
  dateLocale,
  t,
  rpcMessages,
}: {
  orgId: string;
  editionId: string;
  groups: ChecklistGroup[];
  booth: PartnerOverview["booth"];
  canEdit: boolean;
  /**
   * `gruppen`: die ganze Checkliste (Seite Checkliste). `naechste`: nur die
   * übergebenen Aufgaben ohne Köpfe — für die Übersicht (PART-056).
   */
  variant?: "gruppen" | "naechste";
  /** Wörter der Fristmarke (Deadline, noch n Tage, vorbei, erledigt) — wie an den Abschnittsköpfen. */
  fristTexte: FristTexte;
  locale: Locale;
  dateLocale: string;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  // Upload über dieselbe Hülle wie Onboarding und Dateien (PART-035) — ein Ablauf,
  // ein Kern (`uploadDeliverableFile`).
  const { laedt: uploading, hochladen } = usePflichtUpload({
    orgId,
    editionId,
    texte: { tooBig: t.uploadTooBig, wrongType: t.uploadWrongType, failed: t.uploadFailed, done: t.submitted },
    rpcMessages,
  });
  /** Anzahl Personen fürs Lunch-Paket (PART-049), je Pflicht. */
  const [lunchQty, setLunchQty] = useState<Record<string, string>>({});

  /**
   * Das Lunch-Paket direkt hier bestellen (PART-049). Konrad: „super wichtig,
   * dass alle Partner das sehen — wenn man nur dafür in den Shop gehen muss,
   * überlädt das vielleicht."
   *
   * Die Bestellung läuft trotzdem über den Messeshop: die RPC legt die Zeile an
   * und bestätigt sie, damit Frist, Lagerbuch, Rechnung und Produktionsliste
   * mitlaufen. Nur der Weg dorthin ist kürzer.
   */
  const onOrderLunch = (d: Deliverable) => {
    const qty = Number.parseInt(lunchQty[d.id] ?? "", 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast("error", rpcMessages.invalid_qty ?? "");
      return;
    }
    startTransition(async () => {
      const res = await orderLunchPackage({ orgId, editionId, qty });
      if (!res.ok) {
        toast("error", rpcMessages[res.key] ?? res.key);
        return;
      }
      // Lag im Warenkorb schon etwas, ist die Zeile nur eingelegt — dann führt
      // der Weg dorthin, statt eine Bestätigung zu behaupten, die es nicht gibt.
      toast("success", res.data.confirmed ? t.lunchOrdered : t.lunchInCart);
      setLunchQty((q) => ({ ...q, [d.id]: "" }));
      router.refresh();
    });
  };
  /** Welche Zeile ist aufgeklappt. Genau eine — sonst ist es wieder eine Wand. */
  const [offen, setOffen] = useState<string | null>(null);
  // Antworten je Pflicht: der Schlüssel ist das Feld aus `answers_schema`,
  // ohne Schema steht alles unter `note`.
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  // In der Zeile nur das Datum: die Uhrzeit interessiert erst im Detail, und
  // eine Spalte, die umbricht, ist keine Spalte mehr.
  const dateOnly = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const label = (d: Deliverable) =>
    (locale === "en" ? d.label_en : d.label_de) ?? d.label_de ?? d.key;
  const description = (d: Deliverable) =>
    (locale === "en" ? d.description_en : d.description_de) ?? d.description_de;

  /**
   * Überfällig färbt der Client mit, solange das Housekeeping den Status noch
   * nicht nachgezogen hat — eingereicht werden darf trotzdem (Kontrakt B4).
   */
  const isOverdue = (d: Deliverable) =>
    d.status === "overdue" ||
    (EDITABLE.has(d.status) && d.due_at !== null && new Date(d.due_at) < new Date());

  /**
   * Im Kennzeichen steht, was zu tun ist. „Zurückgewiesen" wiegt schwerer als
   * „überfällig": die Rückmeldung ist der Grund, warum es noch offen ist. Das
   * Datum darunter bleibt rot.
   */
  const badgeStatus = (d: Deliverable) =>
    d.status === "open" && isOverdue(d) ? "overdue" : d.status;

  const answerOf = (d: Deliverable, key: string) => answers[d.id]?.[key] ?? "";
  const setAnswer = (d: Deliverable, key: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [d.id]: { ...(prev[d.id] ?? {}), [key]: value } }));
  const fieldLabel = (f: AnswerField) =>
    (locale === "en" ? f.label_en : f.label_de) ?? f.label_de ?? f.key;

  /** Alle Pflichtfelder gefüllt? Die RPC prüft es noch einmal. */
  function formComplete(d: Deliverable): boolean {
    const schema = d.answers_schema;
    if (!schema) return answerOf(d, "note").trim() !== "";
    return schema
      .filter((f) => f.required)
      // `boolean` gilt als beantwortet, sobald angehakt ist; alles andere
      // braucht einen Wert.
      .every((f) =>
        f.type === "boolean" ? answerOf(d, f.key) === "true" : answerOf(d, f.key).trim() !== "",
      );
  }

  /** Antworten so formen, wie die Felder es vorgeben (Zahl, Wahrheitswert …). */
  function answerPayload(d: Deliverable): Record<string, unknown> {
    const schema = d.answers_schema;
    if (!schema) return { note: answerOf(d, "note").trim() };
    const out: Record<string, unknown> = {};
    for (const f of schema) {
      const raw = answerOf(d, f.key);
      if (f.type === "boolean") out[f.key] = raw === "true";
      else if (raw.trim() === "") continue;
      else if (f.type === "number") out[f.key] = Number(raw);
      else out[f.key] = raw.trim();
    }
    return out;
  }

  function onSubmitSimple(d: Deliverable) {
    startTransition(async () => {
      const res = await submitDeliverable(d.id, [], {});
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.markedDone);
      router.refresh();
    });
  }

  function onSubmitForm(d: Deliverable) {
    if (!formComplete(d)) {
      toast("error", message("answers_required"));
      return;
    }
    startTransition(async () => {
      const res = await submitDeliverable(d.id, [], answerPayload(d));
      if (!res.ok) {
        // `answers_incomplete` nennt das fehlende Feld im Detail — den
        // Schlüssel übersetzen wir in die Beschriftung, die danebensteht.
        const field = d.answers_schema?.find((f) => f.key === res.detail);
        toast(
          "error",
          message(res.key) +
            (field ? ` (${fieldLabel(field)})` : res.detail ? ` (${res.detail})` : ""),
        );
        return;
      }
      toast("success", t.markedDone);
      router.refresh();
    });
  }

  async function onDownload(asset: DeliverableAsset) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(asset.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast("error", t.downloadFailed);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  /**
   * Die Frist als Markierung (PART-064: „farblich hervorheben und als Deadline
   * markieren“) — dieselbe `FristMarke` wie an den Abschnittsköpfen, in
   * Zeilenhöhe: offen, bald (unter sieben Tagen), vorbei, erledigt, jeweils
   * mit Farbe und Wort.
   */
  const frist = (d: Deliverable, overdue: boolean, erledigt: boolean) =>
    d.due_at ? (
      <FristMarke
        kompakt
        dueAt={d.due_at}
        dateText={dateOnly.format(new Date(d.due_at))}
        vorbei={overdue}
        erledigt={erledigt}
        t={fristTexte}
      />
    ) : null;

  const zaehler = (group: ChecklistGroup) => (
    <span className="ct-help ml-auto tabular-nums">
      {t.groupDone
        .replace("{done}", String(group.items.filter((d) => badgeStatus(d) === "accepted").length))
        .replace("{total}", String(group.items.length))}
    </span>
  );

  // Eine Liste, keine Kartenwand: Haken links, Aufgabe in der Mitte, Frist
  // rechts. Details stehen erst beim Aufklappen da — vorher erschlug die Seite
  // mit allem auf einmal und man erkannte nicht, dass es eine Checkliste ist
  // (Konrads Befund).
  const liste = (group: ChecklistGroup) => (
    <Card className="p-0">
      <ul className="flex flex-col">
        {group.items.map((d) => {
          const overdue = isOverdue(d);
          const editable = canEdit && EDITABLE.has(d.status);
          const rules: FileRules = d.file_rules;
          const status = badgeStatus(d);
          const erledigt = status === "accepted";
          const auf = offen === d.id;
          return (
            <li key={d.id} className="border-b last:border-b-0">
              <div
                className={
                  "flex items-center gap-3 border-l-2 py-2.5 pr-4 pl-4 transition-colors hover:bg-surface-hover " +
                  (overdue ? "border-l-error-ink bg-error-soft/40" : "border-l-transparent")
                }
              >
                <CheckMark done={erledigt} label={erledigt ? t.doneLabel : t.openLabel} />

                <button
                  type="button"
                  aria-expanded={auf}
                  aria-controls={`d-${d.id}`}
                  onClick={() => setOffen(auf ? null : d.id)}
                  className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-left"
                >
                  <span className={erledigt ? "ct-small text-muted" : "ct-label text-ink"}>
                    {label(d)}
                  </span>
                  {!d.required && <span className="ct-help">{t.optional}</span>}
                  {/* Mobil gibt es keine Fristspalte — dort steht die Markierung unter der Aufgabe. */}
                  {d.due_at && <span className="basis-full sm:hidden">{frist(d, overdue, erledigt)}</span>}
                  <svg
                    viewBox="0 0 12 12"
                    className={`ml-1 h-3 w-3 shrink-0 text-muted transition-transform ${auf ? "rotate-90" : ""}`}
                    aria-hidden
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  >
                    <path d="M4.5 3 7.5 6 4.5 9" />
                  </svg>
                </button>

                {/* Eigene Spalte, wie Konrad es wollte: die Frist ist das
                    zweite, wonach man in einer Checkliste schaut — seit
                    PART-064 als Markierung „Deadline …“. */}
                <span className="hidden w-56 shrink-0 text-right sm:block">
                  {frist(d, overdue, erledigt) ?? <span className="ct-help">—</span>}
                </span>

                <Badge tone={TONE[status] ?? "neutral"}>{t[`status_${status}`] ?? status}</Badge>
              </div>

              {auf && (
                <div id={`d-${d.id}`} className="flex flex-col gap-4 border-t bg-canvas px-4 py-4 sm:flex-row sm:px-14">
                  <div className="min-w-0 flex-1">
                    {description(d) && <p className="ct-small leading-6">{description(d)}</p>}
                    {d.due_at && (
                      <p className={overdue ? "mt-2 ct-help text-error-ink" : "mt-2 ct-help"}>
                        {t.dueOn} {dateTime.format(new Date(d.due_at))}
                        {overdue && ` · ${t.stillPossible}`}
                      </p>
                    )}
                    {d.submitted_at && (
                      <p className="ct-help mt-1">
                        {t.submittedOn} {dateTime.format(new Date(d.submitted_at))}
                      </p>
                    )}
                    {d.review_note && (
                      <p className="mt-1 ct-help leading-5 text-error-ink">
                        {t.reviewNote}: {d.review_note}
                      </p>
                    )}

                    {/* Rückwand: die Maße gehören neben den Upload. */}
                    {d.key === "backdrop_print" && (
                      <p className="ct-help mt-2">
                        {booth?.backdrop_w_mm && booth?.backdrop_h_mm
                          ? t.backdropSize
                              .replace("{w}", String(booth.backdrop_w_mm))
                              .replace("{h}", String(booth.backdrop_h_mm))
                          : t.backdropSizeSoon}
                      </p>
                    )}

                    {d.assets.length > 0 && (
                      <ul className="ct-help mt-3 flex flex-col gap-1">
                        {d.assets.map((a) => (
                          <li key={a.id} className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => onDownload(a)} className="ct-link text-left">
                              {a.filename ?? a.storage_path.split("/").pop()}
                            </button>
                            <span className="tabular-nums">v{a.version}</span>
                            {a.size_bytes != null && <span>{formatBytes(a.size_bytes)}</span>}
                            <span>{dateTime.format(new Date(a.created_at))}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {d.type === "form" &&
                      d.status !== "open" &&
                      Object.keys(d.answers ?? {}).length > 0 && (
                        <dl className="ct-help mt-3 flex flex-col gap-0.5">
                          {Object.entries(d.answers).map(([key, value]) => {
                            const field = d.answers_schema?.find((f) => f.key === key);
                            return (
                              <div key={key} className="flex flex-wrap gap-1">
                                <dt className="font-semibold">{field ? fieldLabel(field) : key}:</dt>
                                <dd className="whitespace-pre-line">
                                  {typeof value === "boolean" ? (value ? t.yes : t.no) : String(value)}
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                      )}
                  </div>

                  <div className="flex w-full flex-col gap-2 sm:max-w-80">
                    {!editable ? (
                      <p className="ct-help">
                        {d.status === "submitted"
                          ? t.waitingForReview
                          : d.status === "accepted"
                            ? t.nothingToDo
                            : t.noRights}
                      </p>
                    ) : d.type === "upload" ? (
                      <>
                        <FileButton
                          uploadLabel={t.commonUpload}
                          changeLabel={t.commonChangeFile}
                          label={d.assets.length > 0 ? t.uploadNew : t.upload}
                          accept={acceptAttribute(rules)}
                          disabled={uploading !== null || pending}
                          hint={t.uploadHint
                            .replace("{allowed}", (rules?.ext ?? []).map((e) => `.${e}`).join(", "))
                            .replace("{max}", formatBytes(rules?.max_bytes ?? 0))}
                          onFile={(file) => void hochladen(d, file)}
                        />
                        {uploading === d.id && <p className="ct-help">{t.uploading}</p>}
                        {/* PART-064: sonst wundert man sich, dass man hier nicht abhaken kann. */}
                        <p className="ct-help">{t.uploadAutoHint}</p>
                      </>
                    ) : d.type === "form" ? (
                      <>
                        {(d.answers_schema ?? []).length > 0 ? (
                          d.answers_schema!.map((f) => (
                            <Field
                              key={f.key}
                              label={fieldLabel(f)}
                              htmlFor={`a-${d.id}-${f.key}`}
                              required={f.required}
                              requiredLabel={t.requiredLabel}
                            >
                              {f.type === "textarea" ? (
                                <Textarea
                                  id={`a-${d.id}-${f.key}`}
                                  rows={4}
                                  value={answerOf(d, f.key)}
                                  onChange={(e) => setAnswer(d, f.key, e.target.value)}
                                />
                              ) : f.type === "select" ? (
                                <Select
                                  id={`a-${d.id}-${f.key}`}
                                  value={answerOf(d, f.key)}
                                  placeholder={t.choose}
                                  options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
                                  onChange={(e) => setAnswer(d, f.key, e.target.value)}
                                />
                              ) : f.type === "boolean" ? (
                                <input
                                  id={`a-${d.id}-${f.key}`}
                                  type="checkbox"
                                  className="h-5 w-5"
                                  checked={answerOf(d, f.key) === "true"}
                                  onChange={(e) => setAnswer(d, f.key, e.target.checked ? "true" : "false")}
                                />
                              ) : (
                                <Input
                                  id={`a-${d.id}-${f.key}`}
                                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                                  value={answerOf(d, f.key)}
                                  onChange={(e) => setAnswer(d, f.key, e.target.value)}
                                />
                              )}
                            </Field>
                          ))
                        ) : (
                          <Field label={t.answer} htmlFor={`a-${d.id}-note`} hint={t.answerHint}>
                            <Textarea
                              id={`a-${d.id}-note`}
                              rows={4}
                              value={answerOf(d, "note")}
                              onChange={(e) => setAnswer(d, "note", e.target.value)}
                            />
                          </Field>
                        )}
                        <Button size="sm" disabled={pending || !formComplete(d)} onClick={() => onSubmitForm(d)}>
                          {t.submit}
                        </Button>
                      </>
                    ) : d.fulfilled_by_sku ? (
                      d.status === "accepted" || !canEdit ? (
                        <p className="ct-help">{t.fulfilledByShop}</p>
                      ) : (
                        // PART-049: bestellen, wo die Aufgabe steht.
                        <div className="flex flex-wrap items-end gap-3">
                          <Field
                            label={t.lunchQty}
                            htmlFor={`lunch-${d.id}`}
                            hint={t.lunchQtyHint}
                          >
                            <Input
                              id={`lunch-${d.id}`}
                              type="number"
                              min={1}
                              inputMode="numeric"
                              className="w-28"
                              value={lunchQty[d.id] ?? ""}
                              onChange={(e) =>
                                setLunchQty((q) => ({ ...q, [d.id]: e.target.value }))
                              }
                            />
                          </Field>
                          <Button
                            size="sm"
                            disabled={pending || !(lunchQty[d.id] ?? "").trim()}
                            onClick={() => onOrderLunch(d)}
                          >
                            {t.lunchOrder}
                          </Button>
                        </div>
                      )
                    ) : (
                      <>
                        <p className="ct-help">{d.type === "booking" ? t.bookingHint : t.infoHint}</p>
                        <Button size="sm" variant="secondary" disabled={pending} onClick={() => onSubmitSimple(d)}>
                          {t.markDone}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );

  // Auf der Übersicht (PART-056): nur die nächsten Aufgaben, ohne Gruppenköpfe —
  // dieselbe Liste mit denselben Aktionen, damit man dort schon abhaken kann.
  if (variant === "naechste") {
    return (
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.sku ?? "global"}>{liste(g)}</div>
        ))}
      </div>
    );
  }

  // PART-064: „Allgemeine Aufgaben“ und die Aufgaben, die aus den gebuchten
  // Leistungen folgen — je Leistung mit eigenem Kopf. „Für alle Partner“ und
  // die Artikelnummer sagten einem Partner nichts.
  const allgemein = groups.filter((g) => g.sku === null);
  const leistungen = groups.filter((g) => g.sku !== null);

  return (
    <div className="flex flex-col gap-8">
      {allgemein.map((group) => (
        <section key="global" aria-labelledby="g-global">
          <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b pb-2">
            <h2 id="g-global" className="ct-h2 scroll-mt-20 text-ink">
              {t.groupGeneral}
            </h2>
            {zaehler(group)}
          </div>
          {liste(group)}
        </section>
      ))}
      {leistungen.length > 0 && (
        <section aria-labelledby="g-leistungen">
          <h2 id="g-leistungen" className="ct-h2 scroll-mt-20 border-b pb-2 text-ink">
            {t.groupProducts}
          </h2>
          <p className="ct-help mt-2 mb-4">{t.groupProductsLead}</p>
          <div className="flex flex-col gap-6">
            {leistungen.map((group) => (
              <div key={group.sku}>
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  <h3 id={`g-${group.sku}`} className="ct-h3 scroll-mt-20 text-ink">
                    {group.label}
                  </h3>
                  {zaehler(group)}
                </div>
                {liste(group)}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
