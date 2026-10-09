"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { AbschnittsNavigation } from "@/components/ui/Abschnitte";
import { Accordion, AccordionItem } from "@/components/ui/Accordion";
import { Badge } from "@/components/ui/Badge";
import { Block } from "@/components/ui/Block";
import { Button } from "@/components/ui/Button";
import { Fortschritt } from "@/components/ui/Fortschritt";
import { useToast } from "@/components/ui/Toast";
import { useUngesichert, type UngesichertTexte } from "@/components/ui/useUngesichert";
import { LogoWandEinwilligung, type LogoWandTexte } from "@/components/partner/LogoWandEinwilligung";
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
import {
  BLOCK_IDS,
  anzahlFertig,
  blockStaende,
  ersterOffener,
  gesamtFehlt,
  kurzfassung,
  marke,
  weichtAb,
  type BlockId,
} from "./bloecke";

type Strings = Record<string, string>;

/**
 * „Eure Daten“: **vier Abschnitte einer Seite**, jeder mit Stand und Kurzfassung in der Zeile, oben die Zahl, wie weit alles
 * ist (PART-106, Konrad 08.10.2026, K-73). Vorher war es ein Wizard mit einer Linie und vier nummerierten Stationen
 * (`StepBar`), eine Karte nach der anderen, „Zurück“ und „Weiter“. Die vier sind aber **unabhängig**: Rechnungsdaten kann man
 * vor der Beschreibung ausfüllen, und der Haken kommt aus dem Inhalt, nicht aus der Position — die Linie las „Schritt 4
 * erledigt, Schritt 3 fehlt“ als Fehler, und die Stationen sahen nicht klickbar aus.
 *
 * Jetzt ist jeder Abschnitt ein `Block` (die ganze Zeile ist das Ziel, mit Pfeil): der erste, der noch etwas braucht, steht beim
 * Laden offen, die fertigen sind zu, und man öffnet in jeder Reihenfolge, auch mehrere zugleich. „Auf dieser Seite“ springt
 * zu den Abschnitten und öffnet sie; die Seitenleiste zeigt dieselben vier als Unterpunkte unter „Eure Daten“ (QS-026) —
 * es entstehen keine neuen Seiten.
 *
 * **Gespeichert wird gesammelt:** die Abschnitte teilen einen Entwurf, eine klebende Leiste unten („Änderungen speichern“,
 * „Verwerfen“) erscheint nur, wenn es Ungespeichertes gibt, und `useUngesichert` warnt beim Verlassen. Das Logo (Upload) und
 * die Einwilligung für die Logowand wirken wie bisher sofort und stehen nicht im Entwurf. Was die Abschnitte als Stand
 * zeigen, wird aus dem Entwurf gelesen (`bloecke.ts`) und ist deshalb schon beim Tippen aktuell.
 */
export function EureDatenView({
  orgId,
  editionId,
  overview,
  logos,
  industries,
  einwilligung,
  locale,
  dateLocale,
  t,
  common,
  unsaved,
  rpcMessages,
}: {
  orgId: string;
  editionId: string;
  overview: PartnerOverview;
  /** Die Logo-Pflichten aus `my_deliverables` — seit 0057 SVG **und** PNG. */
  logos: Deliverable[];
  /** Vokabular `industry` (0138) — dieselben Werte wie das Swapcard-Feld „Branche". */
  industries: Record<string, string>;
  /** Texte der Einwilligung zum Weißen des Logos (Wörterbuch `logoWandEinwilligung`). */
  einwilligung: LogoWandTexte;
  locale: Locale;
  dateLocale: string;
  t: Strings;
  common: { none: string; upload: string; chooseOtherFile: string; onThisPage: string };
  /** Die Rückfrage beim Verlassen mit Ungespeichertem (`common.unsaved`). */
  unsaved: UngesichertTexte;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  // Der gespeicherte Stand, gegen den „ungespeichert“ gilt. Er wandert mit dem Speichern mit, statt auf das Neuladen der
  // Seite zu warten — sonst bliebe die Leiste nach dem Toast noch einen Augenblick stehen.
  const [gespeichert, setGespeichert] = useState<EureDatenEntwurf>(() => entwurfAus(overview));
  const [draft, setDraft] = useState<EureDatenEntwurf>(gespeichert);
  const [fehler, setFehler] = useState<string | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const set = (part: Partial<EureDatenEntwurf>) => setDraft((d) => ({ ...d, ...part }));

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

  const done = overview.edition.onboarding_status !== "invited";
  // Aus der Uebersicht statt als eigenes Prop: so kann die Anzeige nicht von dem
  // abweichen, was die Datenbank ohnehin entscheidet.
  const canEdit = canEditOnboarding(overview.roles, overview.team);

  const dirty = weichtAb(speicherDaten(draft), speicherDaten(gespeichert));
  const warnung = useUngesichert(dirty, unsaved);

  const staende = useMemo(
    () => blockStaende(draft, { da: logosDa, gesamt: logos.length }),
    [draft, logosDa, logos.length],
  );
  // Nur beim Laden: danach öffnet und schließt die Person selbst, ein Abschnitt springt nicht zu, weil er fertig wurde.
  const [startOffen] = useState<BlockId | null>(() =>
    ersterOffener(blockStaende(entwurfAus(overview), { da: logosDa, gesamt: logos.length })),
  );

  const titel: Record<BlockId, string> = {
    unternehmen: t.stepCompany,
    beschreibung: t.stepDescription,
    logo: t.stepLogo,
    rechnung: t.stepInvoice,
  };
  const feldNamen = {
    legal_name: t.fieldLegalName,
    communication_name: t.fieldCommunicationName,
    address_street: t.fieldStreet,
    address_zip: t.fieldZip,
    address_city: t.fieldCity,
    description_de: t.fieldDescriptionDe,
    invoice_email: t.fieldInvoiceEmail,
  };
  const kurzTexte = {
    fehlt: t.blockMissing,
    zeichen: t.blockChars,
    branche: t.blockIndustry,
    logoDa: t.blockLogoThere,
    logoFehlt: t.blockLogoMissing,
  };
  const markenTexte = { fertig: t.blockDone, offen: t.blockOpen, anzahl: t.blockCount };
  const logoFormate = logos.map((l) => ({
    format: (l.file_rules?.ext?.[0] ?? l.key).toUpperCase(),
    da: aktuelleFassung(l) !== null,
  }));

  const fertig = anzahlFertig(staende);
  const fehlt = gesamtFehlt(staende, feldNamen, t.stepLogo);

  function onSave() {
    setFehler(null);
    startTransition(async () => {
      const res = await saveOnboarding(orgId, speicherDaten(draft));
      if (!res.ok) {
        // Der Fehler steht neben dem Knopf, der ihn ausgelöst hat — nicht in einem Toast, den man übersieht.
        setFehler(message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.saved);
      setGespeichert(draft);
      router.refresh();
    });
  }

  return (
    <div className="max-w-text">
      {/* Oben die Zahl, wie weit alles ist — der Balken trägt sie immer mit (Verbotsliste: kein Balken ohne Zahl). */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Fortschritt
            wert={fertig}
            gesamt={BLOCK_IDS.length}
            label={t.onboardingProgress.replace("{n}", String(fertig)).replace("{total}", String(BLOCK_IDS.length))}
            className="basis-full sm:min-w-64 sm:flex-1 sm:basis-auto"
          />
          <Badge tone={done ? "success" : "warning"}>
            {t[`status_${overview.edition.onboarding_status}`] ?? overview.edition.onboarding_status}
          </Badge>
        </div>
        <p className="ct-help">{t.onboardingStepsHint}</p>
        {/* Was noch fehlt, damit der Stand auf „ausgefüllt" springt — eine Aufzählung, keine Fehlermeldung. Es ist kein
            Fehler, dass ein Formular noch nicht fertig ist. */}
        {done ? (
          <div className="rounded-ct-md border border-success-soft bg-success-soft p-4">
            <p className="ct-label text-success-ink">{t.onboardingDoneTitle}</p>
            <p className="ct-small mt-1 text-success-ink">{t.onboardingDoneBody}</p>
          </div>
        ) : (
          fehlt.length > 0 && (
            <p className="ct-help">
              {t.stillMissing}: {fehlt.join(" · ")}
            </p>
          )
        )}
      </div>

      <AbschnittsNavigation
        label={common.onThisPage}
        items={BLOCK_IDS.map((id) => ({ id, label: titel[id] }))}
      />

      <div className="flex flex-col gap-4">
        {staende.map((stand) => (
          <Block
            key={stand.id}
            id={stand.id}
            karte
            ebene="h2"
            titel={titel[stand.id]}
            marke={marke(stand, markenTexte)}
            kurz={kurzfassung(
              stand,
              { draft, feldNamen, logos: logoFormate, branchen: industries },
              kurzTexte,
            )}
            offen={startOffen === stand.id}
          >
            {stand.id === "unternehmen" && (
              <>
                <p className="ct-help mb-4">{t.stepCompanyHint}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <KundennummerInfo value={overview.org.customer_number ?? null} t={t} />
                  <UnternehmenFelder draft={draft} set={set} t={t} />
                </div>
              </>
            )}

            {stand.id === "beschreibung" && (
              <>
                <p className="ct-help mb-4">{t.stepDescriptionHint}</p>
                <div className="flex flex-col gap-4">
                  <BeschreibungFelder draft={draft} set={set} t={t} industries={industries} none={common.none} />
                </div>
              </>
            )}

            {stand.id === "logo" && (
              <>
                {/* PART-060 nach dem Vorschlag des Design-Chats (docs/design-vorschlaege-2026-09-24.md §2):
                    je Datei eine gleichrangige Kachel mit H3 → Text. Wie viele da sind, sagt die Marke im Kopf
                    des Abschnitts, bevor man die Kacheln liest. */}
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
                      t={einwilligung}
                      rpcMessages={rpcMessages}
                    />
                  </div>
                )}
              </>
            )}

            {/* PART-061: der Satz unter der Überschrift („braucht keinen Login“) war ein
                Hinweis für uns, nicht für den Partner — er ist weg. */}
            {stand.id === "rechnung" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <RechnungFelder draft={draft} set={set} t={t} />
              </div>
            )}
          </Block>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="ct-h2 mb-3 text-ink">{t.helpTitle}</h2>
        <Accordion>
          <AccordionItem question={t.helpQ1}>{t.helpA1}</AccordionItem>
          <AccordionItem question={t.helpQ2}>{t.helpA2}</AccordionItem>
          <AccordionItem question={t.helpQ3}>{t.helpA3}</AccordionItem>
        </Accordion>
      </section>

      {/* Die Leiste klebt unten — aber nur, solange es etwas zu speichern gibt. Ein Knopf, der nichts tut, ist eine Einladung zum
          Leerklicken. Sie steht am Ende der Seite, damit sie auch beim Lesen der Fragen darunter im Bild bleibt. */}
      {dirty && (
        <div className="sticky bottom-0 -mx-1 mt-6 flex flex-wrap items-center justify-end gap-3 border-t bg-canvas px-1 py-3">
          <span className="ct-help mr-auto">{t.onboardingUnsaved}</span>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setDraft(gespeichert);
              setFehler(null);
            }}
          >
            {t.onboardingDiscard}
          </Button>
          <Button disabled={pending} onClick={onSave}>
            {t.onboardingSave}
          </Button>
          {fehler && (
            <p role="alert" className="ct-small basis-full text-right text-error-ink">
              {fehler}
            </p>
          )}
        </div>
      )}
      {warnung}
    </div>
  );
}
