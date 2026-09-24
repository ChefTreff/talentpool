"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  acceptAttribute,
  checkFileRules,
  formatBytes,
  type FileRules,
} from "@/lib/partner/file-rules";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FileButton } from "@/components/ui/FileButton";
import { StepBar } from "@/components/ui/StepBar";
import { cn } from "@/components/ui/cn";
import { Accordion, AccordionItem } from "@/components/ui/Accordion";
import { useToast } from "@/components/ui/Toast";
import { LogoWandEinwilligung } from "@/components/partner/LogoWandEinwilligung";
import {
  BeschreibungFelder,
  KundennummerInfo,
  RechnungFelder,
  UnternehmenFelder,
  entwurfAus,
  speicherDaten,
  type EureDatenEntwurf,
} from "@/components/partner/EureDaten";
import {
  registerPartnerAsset,
  saveOnboarding,
  setLogoWhiteningConsent,
  submitDeliverable,
} from "../actions";
import { BUCKET, safeFileName } from "../upload";
import {
  canEditOnboarding,
  type Deliverable,
  type DeliverableAsset,
  type PartnerOverview,
} from "../types";

type Strings = Record<string, string>;

/** Aktuelle Fassung einer Logo-Pflicht, falls es eine gibt. */
function aktuelleFassung(d: Deliverable): DeliverableAsset | null {
  return d.assets.find((a) => a.status !== "rejected") ?? d.assets[0] ?? null;
}

/** SVG und PNG zeigt der Browser; EPS nicht — dort bleibt es beim Dateinamen. */
function vorschaubar(a: DeliverableAsset): boolean {
  const mime = (a.mime ?? "").toLowerCase();
  return mime === "image/svg+xml" || mime === "image/png" || /\.(svg|png)$/i.test(a.filename ?? a.storage_path);
}

export function OnboardingWizard({
  orgId,
  editionId,
  overview,
  logos,
  industries,
  locale,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  orgId: string;
  editionId: string;
  overview: PartnerOverview;
  /** Die Logo-Pflichten aus `my_deliverables` — seit 0057 SVG **und** PNG. */
  logos: Deliverable[];
  /** Vokabular `industry` (0138) — dieselben Werte wie das Swapcard-Feld „Branche". */
  industries: Record<string, string>;
  locale: Locale;
  dateLocale: string;
  t: Strings;
  common: { save: string; cancel: string; none: string; back: string; next: string; upload: string; chooseOtherFile: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<EureDatenEntwurf>(() => entwurfAus(overview));
  const [vorschau, setVorschau] = useState<Record<string, string>>({});

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const set = (part: Partial<EureDatenEntwurf>) => setDraft((d) => ({ ...d, ...part }));

  const allLogosThere = logos.length > 0 && logos.every((d) => aktuelleFassung(d) !== null);
  const logosDa = logos.filter((d) => aktuelleFassung(d) !== null).length;

  // PART-060: Vorschau auf Schachbrett — nur so sieht man, ob ein PNG freigestellt
  // ist. Die Dateien liegen privat; die Leseadresse gilt zehn Minuten.
  const vorschauZiele = useMemo(
    () => logos.map(aktuelleFassung).filter((a): a is DeliverableAsset => a !== null && vorschaubar(a)),
    [logos],
  );
  useEffect(() => {
    if (vorschauZiele.length === 0) return;
    let aktiv = true;
    const supabase = createSupabaseBrowserClient();
    void Promise.all(
      vorschauZiele.map(async (a) => {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path, 600);
        return [a.id, data?.signedUrl ?? ""] as const;
      }),
    ).then((paare) => {
      if (aktiv) setVorschau(Object.fromEntries(paare.filter(([, url]) => url !== "")));
    });
    return () => {
      aktiv = false;
    };
  }, [vorschauZiele]);

  // Der Haken kommt aus dem Inhalt, nicht aus der Position — dieselben Regeln
  // wie in `MissingHint`, damit Anzeige und Hinweis nicht auseinanderlaufen.
  const steps = useMemo(
    () => [
      {
        label: t.stepCompany,
        hint: t.onboardingStepCompanyHint,
        done: Boolean(
          draft.legal_name.trim() &&
            draft.communication_name.trim() &&
            draft.address_street.trim() &&
            draft.address_zip.trim() &&
            draft.address_city.trim(),
        ),
      },
      {
        label: t.stepDescription,
        hint: t.onboardingStepDescriptionHint,
        done: Boolean(draft.description_de.trim()),
      },
      { label: t.stepLogo, hint: t.onboardingStepLogoHint, done: allLogosThere },
      {
        label: t.stepInvoice,
        hint: t.onboardingStepInvoiceHint,
        done: Boolean(draft.invoice_email.trim()),
      },
    ],
    [t, draft, allLogosThere],
  );

  const done = overview.edition.onboarding_status !== "invited";
  // Aus der Uebersicht statt als eigenes Prop: so kann die Anzeige nicht von dem
  // abweichen, was die Datenbank ohnehin entscheidet.
  const canEdit = canEditOnboarding(overview.roles, overview.team);

  function onSave(next?: number) {
    startTransition(async () => {
      const res = await saveOnboarding(orgId, speicherDaten(draft));
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.saved);
      if (next !== undefined) setStep(next);
      router.refresh();
    });
  }

  /**
   * Logo-Upload. Der doppelte Riegel steht nur hier: einmal im Browser aus
   * `file_rules`, damit niemand 20 MB hochlädt, um dann abgewiesen zu werden —
   * und einmal in `register_partner_asset`, worauf allein Verlass ist.
   *
   * Seit Migration 0057 gibt es zwei Logo-Pflichten (SVG und PNG); der Ablauf
   * ist für beide derselbe, die Art im Pfad ist der Schlüssel der Pflicht.
   */
  async function onLogo(logo: Deliverable, file: File) {
    const rules: FileRules = logo.file_rules;
    const bad = checkFileRules(file, rules);
    if (bad) {
      const allowed = (rules?.ext ?? []).map((e) => `.${e}`).join(", ");
      toast(
        "error",
        bad.reason === "size"
          ? t.logoTooBig.replace("{max}", bad.detail)
          : t.logoWrongType.replace("{allowed}", allowed).replace("{got}", bad.detail),
      );
      return;
    }
    setUploading(logo.key);
    try {
      const supabase = createSupabaseBrowserClient();
      const path = `${editionId}/${orgId}/${logo.key}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (up.error) {
        toast("error", `${t.logoFailed} (${up.error.message})`);
        return;
      }
      const reg = await registerPartnerAsset({
        orgId,
        kind: logo.key,
        storagePath: path,
        filename: file.name,
        mime: file.type || null,
        sizeBytes: file.size,
        deliverableId: logo.id,
      });
      if (!reg.ok) {
        // Die Datei bleibt dann verwaist im Bucket. Sie hier zu löschen wäre
        // der zweite Fehlerfall — lieber melden und aufräumen lassen.
        toast("error", message(reg.key) + (reg.detail ? ` (${reg.detail})` : ""));
        return;
      }
      const sub = await submitDeliverable(logo.id, [reg.data.id]);
      if (!sub.ok) {
        toast("error", message(sub.key) + (sub.detail ? ` (${sub.detail})` : ""));
        return;
      }
      toast("success", t.logoDone.replace("{v}", String(reg.data.version)));
      router.refresh();
    } finally {
      setUploading(null);
    }
  }

  async function onDownloadLogo(path: string) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast("error", t.downloadFailed);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <div className="max-w-text">
      {/* Archetyp C: der Fortschritt steht als Linie über dem Inhalt, nicht
          als Knopfreihe. Waagerecht ab 640 px, darunter senkrecht — so
          bricht die Website die Step Section mobil um. */}
      <div className="mb-8 rounded-ct-lg border bg-surface p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="ct-help">{t.onboardingStepsHint}</p>
          <Badge tone={done ? "success" : "warning"}>
            {t[`status_${overview.edition.onboarding_status}`] ??
              overview.edition.onboarding_status}
          </Badge>
        </div>
        <StepBar steps={steps} current={step} srLabel={t.stepperLabel} onSelect={setStep} />
      </div>

      {step === 0 && (
        <Card>
          <h2 className="ct-h2 mb-1 text-ink">{t.stepCompany}</h2>
          <p className="ct-help mb-4">{t.stepCompanyHint}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <KundennummerInfo value={overview.org.customer_number ?? null} t={t} />
            <UnternehmenFelder draft={draft} set={set} t={t} />
          </div>
          <div className="mt-6 flex gap-2">
            <Button disabled={pending} onClick={() => onSave(1)}>
              {common.next}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => onSave()}>
              {common.save}
            </Button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <h2 className="ct-h2 mb-1 text-ink">{t.stepDescription}</h2>
          <p className="ct-help mb-4">{t.stepDescriptionHint}</p>
          <div className="flex flex-col gap-4">
            <BeschreibungFelder draft={draft} set={set} t={t} industries={industries} none={common.none} />
          </div>
          <div className="mt-6 flex gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => setStep(0)}>
              {common.back}
            </Button>
            <Button disabled={pending} onClick={() => onSave(2)}>
              {common.next}
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          {/* PART-060 nach dem Vorschlag des Design-Chats (docs/design-vorschlaege-2026-09-24.md §2):
              H2 „Logo“ → je Datei eine gleichrangige Kachel mit H3 → Text. Die Zahl im Kopf
              sagt, dass es zwei sind, bevor man die Kacheln liest. */}
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="ct-h2 text-ink">{t.stepLogo}</h2>
            {logos.length > 0 && (
              <p className="ct-help tabular-nums">
                {t.logoCount.replace("{n}", String(logosDa)).replace("{total}", String(logos.length))}
              </p>
            )}
          </div>
          <p className="ct-help mb-4">{t.stepLogoHint}</p>

          {logos.length === 0 ? (
            <p className="ct-help">{t.logoMissingDeliverable}</p>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {logos.map((logo) => {
                  const current = aktuelleFassung(logo);
                  const rules: FileRules = logo.file_rules;
                  // Das Formatzeichen kommt aus den Dateiregeln, nicht aus dem Text — ein
                  // weiteres Format bekommt so von selbst sein Zeichen.
                  const format = (rules?.ext?.[0] ?? logo.key).toUpperCase();
                  const url = current ? vorschau[current.id] : undefined;
                  const titel = (locale === "en" ? logo.label_en : logo.label_de) ?? logo.key;
                  return (
                    <section
                      key={logo.id}
                      aria-labelledby={`logo-${logo.id}`}
                      className={cn(
                        "flex flex-col gap-3 rounded-ct-md border p-4",
                        // Was fehlt, sieht anders aus: gestrichelt und mit Satz — Form und Text,
                        // nicht nur Farbe.
                        current ? "border-border" : "border-dashed border-border-strong",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden
                          className="ct-h2 flex size-14 shrink-0 items-center justify-center rounded-ct-md bg-accent-soft text-accent-deep"
                        >
                          {format}
                        </span>
                        <div>
                          <h3 id={`logo-${logo.id}`} className="ct-h3 text-ink">
                            {titel}
                          </h3>
                          <p className="ct-help">
                            {(locale === "en" ? logo.description_en : logo.description_de) ?? ""}
                          </p>
                        </div>
                      </div>

                      {current ? (
                        <>
                          {url && (
                            <div className="flex h-28 items-center justify-center rounded-ct-sm border bg-pattern-transparent p-3">
                              {/* eslint-disable-next-line @next/next/no-img-element -- Signierte Storage-Adresse, keine feste Größe. */}
                              <img
                                src={url}
                                alt={t.logoPreviewAlt.replace("{format}", format)}
                                className="max-h-full max-w-full object-contain"
                              />
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onDownloadLogo(current.storage_path)}
                              className="ct-link break-all text-left"
                            >
                              {current.filename ?? current.storage_path.split("/").pop()}
                            </button>
                            <span className="ct-help">v{current.version}</span>
                            <Badge
                              tone={
                                logo.status === "accepted"
                                  ? "success"
                                  : logo.status === "rejected"
                                    ? "error"
                                    : "accent"
                              }
                            >
                              {t[`deliverable_${logo.status}`] ?? logo.status}
                            </Badge>
                          </div>
                          {logo.submitted_at && (
                            <p className="ct-help">
                              {t.submittedOn} {dateTime.format(new Date(logo.submitted_at))}
                            </p>
                          )}
                          {logo.review_note && (
                            <p className="ct-help text-error-ink">
                              {t.reviewNote}: {logo.review_note}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="ct-small text-muted">{t.logoNone}</p>
                      )}

                      <div className="mt-auto">
                        <FileButton
                          uploadLabel={common.upload}
                          changeLabel={common.chooseOtherFile}
                          label={(current ? t.logoReplaceFormat : t.logoUploadFormat).replace("{format}", format)}
                          accept={acceptAttribute(rules)}
                          disabled={uploading !== null || pending}
                          hint={t.logoHint
                            .replace("{allowed}", (rules?.ext ?? []).map((x) => `.${x}`).join(", "))
                            .replace("{max}", formatBytes(rules?.max_bytes ?? 0))}
                          onFile={(file) => void onLogo(logo, file)}
                        />
                        {uploading === logo.key && <p className="ct-help mt-2">{t.logoUploading}</p>}
                      </div>
                    </section>
                  );
                })}
              </div>

              {/* Die Erlaubnis steht **beim Logo**, nicht in den Stammdaten: hier
                  entscheidet der Partner ohnehin über seine Marke, und er soll wissen,
                  was mit der Datei passiert, bevor er sie hochlädt (PART-053). */}
              <LogoWandEinwilligung
                grantedAt={overview.edition.logo_whitening_consent_at ?? null}
                canEdit={canEdit}
                onSet={async (granted) => {
                  const res = await setLogoWhiteningConsent({ orgId, granted, editionId });
                  return res.ok ? { ok: true } : { ok: false, key: res.key };
                }}
                dateLocale={dateLocale}
                t={t.logoWall as unknown as Record<string, string>}
                rpcMessages={rpcMessages}
              />
            </div>
          )}

          <div className="mt-6 flex gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => setStep(1)}>
              {common.back}
            </Button>
            <Button disabled={pending} onClick={() => setStep(3)}>
              {common.next}
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card>
          {/* PART-061: der Satz unter der Überschrift („braucht keinen Login“) war ein
              Hinweis für uns, nicht für den Partner — er ist weg. */}
          <h2 className="ct-h2 mb-4 text-ink">{t.stepInvoice}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <RechnungFelder draft={draft} set={set} t={t} />
          </div>
          <div className="mt-6 flex gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => setStep(2)}>
              {common.back}
            </Button>
            <Button disabled={pending} onClick={() => onSave()}>
              {common.save}
            </Button>
          </div>
        </Card>
      )}

      {/* Was noch fehlt, damit der Stand auf „ausgefüllt" springt — eine
          Aufzählung, keine Fehlermeldung. Es ist kein Fehler, dass ein
          Formular noch nicht fertig ist (Archetyp C). */}
      {done ? (
        <div className="mt-6 rounded-ct-md border border-success-soft bg-success-soft p-4">
          <p className="ct-label text-success-ink">{t.onboardingDoneTitle}</p>
          <p className="ct-small mt-1 text-success-ink">{t.onboardingDoneBody}</p>
        </div>
      ) : (
        <MissingHint draft={draft} hasLogo={allLogosThere} t={t} />
      )}

      <section className="mt-10">
        <h2 className="ct-h2 mb-3 text-ink">{t.helpTitle}</h2>
        <Accordion>
          <AccordionItem question={t.helpQ1}>{t.helpA1}</AccordionItem>
          <AccordionItem question={t.helpQ2}>{t.helpA2}</AccordionItem>
          <AccordionItem question={t.helpQ3}>{t.helpA3}</AccordionItem>
        </Accordion>
      </section>
    </div>
  );
}

function MissingHint({
  draft,
  hasLogo,
  t,
}: {
  draft: EureDatenEntwurf;
  hasLogo: boolean;
  t: Strings;
}) {
  const missing: string[] = [];
  if (!draft.legal_name.trim()) missing.push(t.fieldLegalName);
  if (!draft.communication_name.trim()) missing.push(t.fieldCommunicationName);
  if (!draft.address_street.trim()) missing.push(t.fieldStreet);
  if (!draft.address_zip.trim()) missing.push(t.fieldZip);
  if (!draft.address_city.trim()) missing.push(t.fieldCity);
  if (!draft.invoice_email.trim()) missing.push(t.fieldInvoiceEmail);
  if (!draft.description_de.trim()) missing.push(t.fieldDescriptionDe);
  if (!hasLogo) missing.push(t.stepLogo);
  if (missing.length === 0) return null;
  return (
    <p className="ct-help mt-4">
      {t.stillMissing}: {missing.join(" · ")}
    </p>
  );
}
