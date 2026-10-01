"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { PRIVACY_URL } from "@/components/layout/PortalFooter";
import { BROWSER_KANTE, HONIGTOPF, MAX_BILDER, MAX_BILD_BYTES, MAX_WOERTER, woerter } from "@/lib/award/regeln";

type Texte = Record<string, string>;
type Feld =
  | "name" | "location" | "description" | "mission" | "project" | "contact_first_name" | "contact_last_name"
  | "contact_email" | "founded_year" | "active_members" | "website" | "university" | "notes";

/** Ein Bild auf die lange Kante `BROWSER_KANTE` als JPEG — damit drei Bilder in eine Anfrage passen. */
async function verkleinereImBrowser(datei: File): Promise<Blob> {
  const bild = await createImageBitmap(datei);
  const faktor = Math.min(1, BROWSER_KANTE / Math.max(bild.width, bild.height));
  const leinwand = document.createElement("canvas");
  leinwand.width = Math.round(bild.width * faktor);
  leinwand.height = Math.round(bild.height * faktor);
  leinwand.getContext("2d")?.drawImage(bild, 0, 0, leinwand.width, leinwand.height);
  bild.close();
  return await new Promise<Blob>((ok, fehler) =>
    leinwand.toBlob((b) => (b ? ok(b) : fehler(new Error("toBlob"))), "image/jpeg", 0.85),
  );
}

/**
 * Bewerbungsformular Initiativen-Award (ADM-024). Felder und Wortgrenzen wie
 * im Airtable-Formular. Das versteckte Feld `HONIGTOPF` bleibt für Menschen
 * leer; die Route verwirft, was es ausfüllt.
 */
export function BewerbungsFormular({
  themen,
  t,
  privacyLabel,
}: {
  themen: { value: string; label: string }[];
  t: Texte;
  privacyLabel: string;
}) {
  const [werte, setWerte] = useState<Record<Feld, string>>({
    name: "", location: "", description: "", mission: "", project: "", contact_first_name: "", contact_last_name: "",
    contact_email: "", founded_year: "", active_members: "", website: "", university: "", notes: "",
  });
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [bilder, setBilder] = useState<File[]>([]);
  const [einwilligung, setEinwilligung] = useState(false);
  const [fehler, setFehler] = useState<{ feld: string; text: string } | null>(null);
  const [sendet, setSendet] = useState(false);
  const [fertig, setFertig] = useState(false);

  const setze = (f: Feld) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setWerte((w) => ({ ...w, [f]: e.target.value }));
  const fehlerFuer = (f: string) => (fehler?.feld === f ? fehler.text : undefined);
  const zaehler = (f: keyof typeof MAX_WOERTER) =>
    t.wordCount.replace("{n}", String(woerter(werte[f]))).replace("{max}", String(MAX_WOERTER[f]));

  async function absenden(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    for (const f of ["description", "mission", "project"] as const) {
      if (woerter(werte[f]) > MAX_WOERTER[f]) { setFehler({ feld: f, text: t.tooManyWords }); return; }
    }
    if (gewaehlt.length === 0) { setFehler({ feld: "topics", text: t.required }); return; }
    if (bilder.length < 2 || bilder.length > MAX_BILDER) { setFehler({ feld: "images", text: t.imagesCount }); return; }
    if (!einwilligung) { setFehler({ feld: "privacy_consent", text: t.consentRequired }); return; }
    setSendet(true);
    setFehler(null);
    try {
      const daten = new FormData(e.currentTarget);
      daten.delete("images");
      for (const datei of bilder) {
        const klein = await verkleinereImBrowser(datei);
        if (klein.size > MAX_BILD_BYTES) { setFehler({ feld: "images", text: t.imageTooLarge }); return; }
        daten.append("images", klein, datei.name.replace(/\.[^.]+$/, "") + ".jpg");
      }
      gewaehlt.forEach((k) => daten.append("topics", k));
      daten.set("privacy_consent", "true");
      const antwort = await fetch("/api/award/bewerbung", { method: "POST", body: daten });
      const { status, field } = (await antwort.json()) as { status?: string; field?: string };
      if (status === "ok") { setFertig(true); return; }
      const text =
        status === "closed" ? t.closed
        : status === "rate_limited" ? t.rateLimited
        : field === "images" ? t.imageInvalid
        : field === "length" ? t.tooLong
        : field === "contact_email" ? t.emailInvalid
        : field === "privacy_consent" ? t.consentRequired
        : status === "invalid" ? t.required
        : t.error;
      setFehler({ feld: field ?? "form", text });
    } catch {
      setFehler({ feld: "form", text: t.error });
    } finally {
      setSendet(false);
    }
  }

  if (fertig) {
    return (
      <Card>
        <h2 className="ct-h3">{t.doneTitle}</h2>
        <p className="ct-small mt-2">{t.doneBody}</p>
      </Card>
    );
  }

  const text = (f: Feld, label: string, opts: { pflicht?: boolean; typ?: string; hint?: string; lang?: boolean; zeilen?: number } = {}) => (
    <Field label={label} htmlFor={`aw-${f}`} required={opts.pflicht} requiredLabel={t.requiredLabel} hint={opts.hint} error={fehlerFuer(f)}>
      {opts.lang ? (
        <Textarea id={`aw-${f}`} name={f} rows={opts.zeilen ?? 6} value={werte[f]} onChange={setze(f)} required={opts.pflicht} />
      ) : (
        <Input id={`aw-${f}`} name={f} type={opts.typ ?? "text"} value={werte[f]} onChange={setze(f)} required={opts.pflicht} />
      )}
    </Field>
  );

  return (
    <form onSubmit={absenden} className="flex flex-col gap-5" noValidate>
      {/* Honigtopf: für Menschen unsichtbar und nicht erreichbar. */}
      <div aria-hidden="true" className="sr-only">
        <label htmlFor="aw-hp">Homepage</label>
        <input id="aw-hp" name={HONIGTOPF} type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Card className="flex flex-col gap-5">
        {text("name", t.name, { pflicht: true })}
        <fieldset>
          <legend className="ct-label">{t.topics} <span className="text-muted">({t.requiredLabel})</span></legend>
          <p className="ct-help">{t.topicsHint}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {themen.map((th) => (
              <label key={th.value} className="flex min-h-11 items-center gap-2 ct-small">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent"
                  checked={gewaehlt.includes(th.value)}
                  onChange={(e) =>
                    setGewaehlt((g) => (e.target.checked ? [...g, th.value] : g.filter((x) => x !== th.value)))
                  }
                />
                {th.label}
              </label>
            ))}
          </div>
          {fehlerFuer("topics") && <p className="ct-small mt-1 text-error-ink" role="alert">{fehlerFuer("topics")}</p>}
        </fieldset>
        {text("location", t.location, { pflicht: true, hint: t.locationHint })}
        {text("description", t.description, { pflicht: true, lang: true, hint: `${t.descriptionHint} ${zaehler("description")}` })}
        {text("mission", t.mission, { pflicht: true, lang: true, zeilen: 8, hint: `${t.missionHint} ${zaehler("mission")}` })}
        {text("project", t.project, { pflicht: true, lang: true, zeilen: 8, hint: `${t.projectHint} ${zaehler("project")}` })}
      </Card>

      <Card className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          {text("contact_first_name", t.firstName, { pflicht: true })}
          {text("contact_last_name", t.lastName, { pflicht: true })}
        </div>
        {text("contact_email", t.email, { pflicht: true, typ: "email" })}
        <div className="grid gap-5 sm:grid-cols-2">
          {text("founded_year", t.foundedYear, { typ: "number", hint: t.foundedYearHint })}
          {text("active_members", t.members, { typ: "number", hint: t.membersHint })}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {text("website", t.website, { typ: "url" })}
          {text("university", t.university)}
        </div>
        <Field label={t.images} htmlFor="aw-images" required requiredLabel={t.requiredLabel} hint={t.imagesHint} error={fehlerFuer("images")}>
          <input
            id="aw-images"
            name="images"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="ct-small"
            onChange={(e) => setBilder(Array.from(e.target.files ?? []).slice(0, MAX_BILDER))}
          />
        </Field>
        {text("notes", t.notes, { lang: true, zeilen: 4 })}
        <label className="flex items-start gap-2 ct-small">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-accent" checked={einwilligung} onChange={(e) => setEinwilligung(e.target.checked)} />
          <span>
            {t.consent}{" "}
            <a href={PRIVACY_URL} className="ct-link" target="_blank" rel="noopener noreferrer">{privacyLabel}</a>
          </span>
        </label>
        {fehlerFuer("privacy_consent") && <p className="ct-small text-error-ink" role="alert">{fehlerFuer("privacy_consent")}</p>}
      </Card>

      {fehler && !["topics", "images", "privacy_consent", ...Object.keys(werte)].includes(fehler.feld) && (
        <p className="ct-small text-error-ink" role="alert">{fehler.text}</p>
      )}
      <div>
        <Button type="submit" loading={sendet} disabled={sendet}>{t.submit}</Button>
      </div>
    </form>
  );
}
