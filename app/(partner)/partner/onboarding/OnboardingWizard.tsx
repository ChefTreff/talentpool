"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StepBar } from "@/components/ui/StepBar";
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
import { saveOnboarding, setLogoWhiteningConsent } from "../actions";
import {
  UploadKachel,
  aktuelleFassung,
  useDateiOeffnen,
  usePflichtUpload,
  useVorschau,
} from "../UploadKachel";
import { canEditOnboarding, type Deliverable, type PartnerOverview } from "../types";

type Strings = Record<string, string>;

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
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<EureDatenEntwurf>(() => entwurfAus(overview));

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const set = (part: Partial<EureDatenEntwurf>) => setDraft((d) => ({ ...d, ...part }));

  const allLogosThere = logos.length > 0 && logos.every((d) => aktuelleFassung(d) !== null);
  const logosDa = logos.filter((d) => aktuelleFassung(d) !== null).length;

  // PART-060: Vorschau auf Schachbrett, Upload und Öffnen — dieselbe Umsetzung wie
  // auf der Dateien-Seite (PART-035/065).
  const vorschau = useVorschau(logos);
  const { laedt, hochladen } = usePflichtUpload({
    orgId,
    editionId,
    texte: { tooBig: t.logoTooBig, wrongType: t.logoWrongType, failed: t.logoFailed, done: t.logoDone },
    rpcMessages,
  });
  const oeffnen = useDateiOeffnen(t.downloadFailed);

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
                  return (
                    <UploadKachel
                      key={logo.id}
                      pflicht={logo}
                      titel={(locale === "en" ? logo.label_en : logo.label_de) ?? logo.key}
                      beschreibung={(locale === "en" ? logo.description_en : logo.description_de) ?? null}
                      vorschauUrl={current ? vorschau[current.id] : undefined}
                      kannHochladen
                      laedt={laedt === logo.id}
                      gesperrt={laedt !== null || pending}
                      statusText={t[`deliverable_${logo.status}`] ?? logo.status}
                      dateTime={dateTime}
                      t={{
                        upload: t.logoUploadFormat,
                        replace: t.logoReplaceFormat,
                        none: t.logoNone,
                        hint: t.logoHint,
                        uploading: t.logoUploading,
                        previewAlt: t.logoPreviewAlt,
                        submittedOn: t.submittedOn,
                        reviewNote: t.reviewNote,
                        upload_button: common.upload,
                        change_file: common.chooseOtherFile,
                      }}
                      onFile={(file) => void hochladen(logo, file)}
                      onOeffnen={(path) => void oeffnen(path)}
                    />
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
