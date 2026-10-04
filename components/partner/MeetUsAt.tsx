"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BildZuschnitt } from "@/components/ui/BildZuschnitt";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FileButton } from "@/components/ui/FileButton";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  FORMATE,
  FORMAT_SCHLUESSEL,
  VARIANTEN,
  dateiname,
  datumszeile,
  jahrVon,
  type FormatKey,
  type Variante,
} from "@/lib/grafik/meet-us-at";
import {
  zeichneMeetUsAt,
  type Bild,
  type Eingabe,
  type Farben,
  type Schriften,
} from "@/lib/grafik/meet-us-at-zeichnen";

type Strings = Record<string, string>;

const MIME = ["image/jpeg", "image/png", "image/webp"];
const MIME_LOGO = [...MIME, "image/svg+xml"];
const MAX_BYTES = 10 * 1024 * 1024;

export type Kontakt = { id: string; name: string; rolle: string };

/** Was die Seite aus der Datenbank mitbringt; alles andere entsteht hier im Browser. */
export type MeetUsAtProps = {
  orgName: string;
  /** Das gespeicherte PNG-Logo (kurzlebige, signierte Adresse) oder `null`. */
  logo: { url: string; name: string } | null;
  kontakte: Kontakt[];
  edition: { start: string | null; ende: string | null };
  /** Sprache des Portals — die Vorgabe für die Sprache der Grafik. */
  portalSprache: "de" | "en";
  /** Wörterbuch `partnerMeetUs` in der Sprache des Portals. */
  t: Strings;
  /** Wörterbuch `meetUsAtGrafik` je Sprache: was **auf** der Grafik steht. */
  texte: Record<"de" | "en", Strings>;
};

/** Alles, was erst im Browser bekannt ist: Tokenfarben und Schriftfamilien. */
type Basis = { farben: Farben; schriften: Schriften };

function ladeBild(src: string, anonym = false): Promise<HTMLImageElement> {
  return new Promise((ok, fehler) => {
    const img = new Image();
    if (anonym) img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => fehler(new Error("bild"));
    img.src = src;
  });
}

const alsBild = (img: HTMLImageElement): Bild => ({
  quelle: img,
  breite: img.naturalWidth || 300,
  hoehe: img.naturalHeight || 300,
});

/**
 * Die „Meet us at“-Grafik der Partner (PART-096) — Motiv, Format und Sprache
 * wählen, Logo oder Porträt einsetzen, als PNG herunterladen.
 *
 * Wie die „Hear me speak“-Grafik der Speaker entsteht sie **im Browser**: das
 * Logo und das Porträt werden gezeichnet und heruntergeladen, aber nirgends
 * gespeichert. Das gespeicherte Logo aus dem Onboarding kommt nur zum Lesen
 * über seine signierte Adresse; die Bytes gehen nicht an uns zurück.
 *
 * Die Farben stehen in den Tokens, die Schriften in den Schriftvariablen; eine
 * Leinwand kennt beides nicht als Klasse, darum liest `ladeBasis` sie einmal
 * zur Laufzeit aus (Skill-Regel 2) und wartet, bis die Schriften geladen sind —
 * sonst zeichnete die erste Fassung in der Ersatzschrift.
 */
export function MeetUsAt({ orgName, logo, kontakte, edition, portalSprache, t, texte }: MeetUsAtProps) {
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [basis, setBasis] = useState<Basis | null>(null);
  const [variante, setVariante] = useState<Variante>("logo");
  const [format, setFormat] = useState<FormatKey>("quadrat");
  const [sprache, setSprache] = useState<"de" | "en">(portalSprache);
  const [plakette, setPlakette] = useState<"hell" | "dunkel">("hell");
  const [logoGroesse, setLogoGroesse] = useState(0.85);

  const [gespeichert, setGespeichert] = useState<Bild | null>(null);
  const [logoFehler, setLogoFehler] = useState(false);
  const [eigenesLogo, setEigenesLogo] = useState<{ bild: Bild; name: string } | null>(null);
  const [foto, setFoto] = useState<Bild | null>(null);
  // Das gewählte Porträt, solange der Zuschnitt-Dialog offen ist (ADM-066).
  const [zuschnitt, setZuschnitt] = useState<File | null>(null);

  const erster = kontakte[0] ?? null;
  const [kontaktId, setKontaktId] = useState(erster?.id ?? "");
  const [name, setName] = useState(erster?.name ?? "");
  const [rolle, setRolle] = useState(erster?.rolle ?? "");
  const [firma, setFirma] = useState(orgName);

  // Farben und Schriften einmal lesen und die Schriften laden.
  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      const css = getComputedStyle(document.documentElement);
      const lies = (n: string) => css.getPropertyValue(n).trim();
      const schriften: Schriften = { fett: lies("--font-display"), kursiv: lies("--font-accent") };
      const farben: Farben = {
        navy: lies("--ct-navy"),
        akzent: lies("--ct-accent"),
        akzentWeich: lies("--ct-accent-soft"),
        akzentTief: lies("--ct-accent-deep"),
        highlight: lies("--ct-highlight"),
        text: lies("--ct-on-navy"),
        textGedaempft: lies("--ct-on-navy-muted"),
        flaeche: lies("--ct-surface"),
        rahmenDunkel: lies("--ct-navy-border"),
      };
      // Eine Schrift, die nicht lädt, soll die Seite nicht blockieren: die
      // Grafik fällt dann auf die Ersatzschrift der Liste zurück.
      await Promise.all([
        document.fonts.load(`800 48px ${schriften.fett}`),
        document.fonts.load(`600 24px ${schriften.fett}`),
        document.fonts.load(`italic 400 40px ${schriften.kursiv}`),
      ]).catch(() => undefined);

      if (!abgebrochen) setBasis({ farben, schriften });
    })();
    return () => {
      abgebrochen = true;
    };
  }, []);

  // Das gespeicherte Logo laden. `anonym`: die Leinwand bleibt sonst „verunreinigt“
  // und lässt sich nicht exportieren; der Speicher antwortet mit CORS-Kopf.
  useEffect(() => {
    if (!logo) return;
    let abgebrochen = false;
    ladeBild(logo.url, true).then(
      (img) => {
        if (!abgebrochen) setGespeichert(alsBild(img));
      },
      () => {
        if (!abgebrochen) setLogoFehler(true);
      },
    );
    return () => {
      abgebrochen = true;
    };
  }, [logo]);

  const tg = texte[sprache];
  const aktivesLogo = eigenesLogo?.bild ?? gespeichert;

  const zeile = useMemo(
    () => datumszeile(edition.start, edition.ende, tg.dateLocale, tg.venue),
    [edition.start, edition.ende, tg.dateLocale, tg.venue],
  );
  const jahr = jahrVon(edition.start);

  // Zeichnen, sobald sich etwas ändert. Die Leinwand ändert mit dem Format ihre
  // Größe und leert sich dabei — deshalb steht das Zeichnen hier und nicht im Handler.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !basis) return;
    const e: Eingabe = {
      format,
      variante,
      kopf: [tg.head1, tg.head2],
      jahr,
      datumszeile: zeile,
      sprache: tg.dateLocale,
      plakette,
      logoGroesse,
      name,
      rolle,
      firma,
    };
    zeichneMeetUsAt(ctx, e, { logo: aktivesLogo, foto }, basis.farben, basis.schriften);
  }, [basis, format, variante, tg, jahr, zeile, plakette, logoGroesse, name, rolle, firma, aktivesLogo, foto]);

  /** Typ und Größe prüfen, bevor etwas geöffnet wird; den Fehler meldet die Funktion selbst. */
  function pruefen(datei: File, erlaubt: string[]): boolean {
    if (datei.size > MAX_BYTES) {
      toast("error", t.tooBig);
      return false;
    }
    if (datei.type && !erlaubt.includes(datei.type)) {
      toast("error", t.wrongType);
      return false;
    }
    return true;
  }

  /** Datei prüfen und als Bild öffnen. */
  async function oeffnen(datei: File, erlaubt: string[]): Promise<Bild | null> {
    if (!pruefen(datei, erlaubt)) return null;
    const url = URL.createObjectURL(datei);
    try {
      return alsBild(await ladeBild(url));
    } catch {
      toast("error", t.loadFailed);
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function logoWaehlen(datei: File) {
    const bild = await oeffnen(datei, MIME_LOGO);
    if (bild) setEigenesLogo({ bild, name: datei.name });
  }

  /** Das Porträt wird erst zugeschnitten (ADM-066): das Dreieck zeigt, was in der Grafik zu sehen sein wird. */
  function fotoWaehlen(datei: File) {
    if (pruefen(datei, MIME)) setZuschnitt(datei);
  }

  async function fotoUebernehmen(zugeschnitten: File) {
    const bild = await oeffnen(zugeschnitten, MIME);
    if (bild) setFoto(bild);
  }

  function kontaktWaehlen(id: string) {
    setKontaktId(id);
    const k = kontakte.find((x) => x.id === id);
    if (k) {
      setName(k.name);
      setRolle(k.rolle);
    }
  }

  function herunterladen() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        toast("error", t.exportFailed);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = dateiname(variante === "person" ? name : firma, format, variante);
      a.click();
      URL.revokeObjectURL(url);
      toast("success", t.downloaded);
    }, "image/png");
  }

  const L = FORMATE[format];
  const motivName = variante === "person" ? t.motifPerson : t.motifLogo;
  const formatName = t[`format${format[0].toUpperCase()}${format.slice(1)}`];
  const vorschau = t.previewLabel.replace("{motif}", motivName).replace("{format}", formatName);

  // Die Vorschau soll im Hochformat und in der Story nicht höher werden als der Bildschirm.
  const breite = format === "quadrat" ? "max-w-lg" : format === "hochformat" ? "max-w-md" : "max-w-xs";

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Am Rechner bleibt die Vorschau beim Scrollen sichtbar, solange man unten Felder ändert. */}
        <Card className="lg:sticky lg:top-6 lg:flex-1 lg:self-start">
          <div className={`mx-auto w-full ${breite}`}>
            <canvas
              ref={canvasRef}
              width={L.breite}
              height={L.hoehe}
              role="img"
              aria-label={vorschau}
              className="w-full rounded-ct-sm border bg-navy"
              style={{ aspectRatio: `${L.breite} / ${L.hoehe}` }}
            />
          </div>
          <p className="ct-help mt-3 text-center" role="status">
            {basis ? "" : t.loading}
          </p>
        </Card>

        <div className="flex flex-1 flex-col gap-6">
          <section aria-labelledby="mu-motiv" className="flex flex-col gap-3">
            <h2 id="mu-motiv" className="ct-h3 text-ink">
              {t.stepMotif}
            </h2>
            <Select
              id="mu-variante"
              aria-labelledby="mu-motiv"
              value={variante}
              onChange={(e) => setVariante(e.target.value as Variante)}
              options={VARIANTEN.map((v) => ({ value: v, label: v === "person" ? t.motifPerson : t.motifLogo }))}
            />
          </section>

          <section aria-labelledby="mu-format" className="flex flex-col gap-3">
            <h2 id="mu-format" className="ct-h3 text-ink">
              {t.stepFormat}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.format} htmlFor="mu-format-wahl">
                <Select
                  id="mu-format-wahl"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as FormatKey)}
                  options={FORMAT_SCHLUESSEL.map((k) => ({ value: k, label: t[`format${k[0].toUpperCase()}${k.slice(1)}`] }))}
                />
              </Field>
              <Field label={t.language} htmlFor="mu-sprache">
                <Select
                  id="mu-sprache"
                  value={sprache}
                  onChange={(e) => setSprache(e.target.value as "de" | "en")}
                  options={[
                    { value: "de", label: t.languageDe },
                    { value: "en", label: t.languageEn },
                  ]}
                />
              </Field>
            </div>
            <p className="ct-help">{t.formatHint}</p>
          </section>

          {variante === "logo" ? (
            <section aria-labelledby="mu-logo" className="flex flex-col gap-3">
              <h2 id="mu-logo" className="ct-h3 text-ink">
                {t.stepLogo}
              </h2>
              <p className="ct-help">
                {eigenesLogo
                  ? t.logoChosen.replace("{name}", eigenesLogo.name)
                  : logoFehler
                    ? t.logoFailed
                    : logo
                      ? t.logoStored.replace("{name}", logo.name)
                      : t.logoMissing}
              </p>
              <FileButton
                variant="secondary"
                sofort
                label={aktivesLogo ? t.logoReplace : t.logoChoose}
                accept={MIME_LOGO.join(",")}
                hint={t.logoRules}
                onFile={(f) => void logoWaehlen(f)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1" htmlFor="mu-groesse">
                  <span className="ct-label text-ink">{t.logoSize}</span>
                  <input
                    id="mu-groesse"
                    type="range"
                    min={0.4}
                    max={1}
                    step={0.01}
                    value={logoGroesse}
                    onChange={(e) => setLogoGroesse(Number(e.target.value))}
                    // Wie der Regler der Speaker-Grafik: 44 px Höhe auf groben Zeigern (SPK-079).
                    className="w-full accent-accent pointer-coarse:h-11"
                  />
                </label>
                <Field label={t.plate} htmlFor="mu-plakette" hint={t.plateHint}>
                  <Select
                    id="mu-plakette"
                    value={plakette}
                    onChange={(e) => setPlakette(e.target.value as "hell" | "dunkel")}
                    options={[
                      { value: "hell", label: t.plateLight },
                      { value: "dunkel", label: t.plateDark },
                    ]}
                  />
                </Field>
              </div>
              <Field label={t.fieldCompany} htmlFor="mu-firma-logo">
                <Input id="mu-firma-logo" value={firma} maxLength={80} onChange={(e) => setFirma(e.target.value)} />
              </Field>
            </section>
          ) : (
            <section aria-labelledby="mu-person" className="flex flex-col gap-3">
              <h2 id="mu-person" className="ct-h3 text-ink">
                {t.stepPerson}
              </h2>
              {kontakte.length > 0 && (
                <Field label={t.contactPick} htmlFor="mu-kontakt">
                  <Select
                    id="mu-kontakt"
                    value={kontaktId}
                    placeholder={t.contactNone}
                    onChange={(e) => kontaktWaehlen(e.target.value)}
                    options={kontakte.map((k) => ({ value: k.id, label: k.name }))}
                  />
                </Field>
              )}
              <Field label={t.fieldName} htmlFor="mu-name">
                <Input id="mu-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label={t.fieldRole} htmlFor="mu-rolle">
                <Input id="mu-rolle" value={rolle} maxLength={80} onChange={(e) => setRolle(e.target.value)} />
              </Field>
              <Field label={t.fieldCompany} htmlFor="mu-firma">
                <Input id="mu-firma" value={firma} maxLength={80} onChange={(e) => setFirma(e.target.value)} />
              </Field>
              <FileButton
                variant="secondary"
                sofort
                label={foto ? t.photoReplace : t.photoChoose}
                accept={MIME.join(",")}
                hint={t.photoRules}
                onFile={fotoWaehlen}
              />
            </section>
          )}

          <section aria-labelledby="mu-laden" className="flex flex-col gap-3">
            <h2 id="mu-laden" className="ct-h3 text-ink">
              {t.stepDownload}
            </h2>
            <div>
              <Button disabled={!basis} onClick={herunterladen}>
                {t.download}
              </Button>
            </div>
            <p className="ct-help">{t.tip}</p>
            <p className="ct-help">{t.privacyNote}</p>
          </section>
        </div>
      </div>

      {zuschnitt && (
        <BildZuschnitt
          datei={zuschnitt}
          onAbbruch={() => setZuschnitt(null)}
          onFertig={(zugeschnitten) => {
            setZuschnitt(null);
            void fotoUebernehmen(zugeschnitten);
          }}
        />
      )}
    </>
  );
}
