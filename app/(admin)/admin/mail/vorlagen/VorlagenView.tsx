"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FormatLeiste } from "@/components/ui/FormatLeiste";
import { SuchFeld } from "@/components/ui/SuchFeld";
import { ersetzeAlsEingabe, verlaufBefehl } from "@/components/ui/textfeld-bearbeiten";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import type { MailKategorie } from "@/lib/mail/kategorien";
import { knopfProbleme } from "@/lib/mail/knoepfe";
import { MAIL_LEISTE, WERKZEUGE, wendeAn, type WerkzeugKey } from "@/lib/markdown-werkzeuge";
import {
  SPRACHEN,
  einsetzen,
  passt,
  platzhalter,
  unbekanntePlatzhalter,
  type Sprache,
  type Vorlage,
} from "@/lib/mail/vorlagen";
import {
  loadHistory,
  previewTemplate,
  restoreTemplate,
  saveTemplatePair,
  setTemplateMeta,
  type Fassung as Verlauf,
  type Fassungsdaten,
  type VorlageResult,
} from "./actions";

type Strings = Record<string, string>;

type Entwurf = Record<Sprache, Fassungsdaten>;

/** Der gespeicherte Stand als Entwurf; eine fehlende Sprache steht leer da. */
function basis(v: Vorlage): Entwurf {
  return {
    de: { subject: v.de?.subject ?? "", body_md: v.de?.body_md ?? "" },
    en: { subject: v.en?.subject ?? "", body_md: v.en?.body_md ?? "" },
  };
}

/**
 * Mail-Vorlagen bearbeiten (ADM-102).
 *
 * Konrad: „Man hat ja immer wieder kleine Änderungen.“ Links die Liste — **eine Zeile je Vorlage** mit Anzeigename,
 * nach Bereich gruppiert, durchsuchbar —, rechts der Text mit **beiden Sprachen** hinter einem Umschalter und einer
 * gemeinsamen Speichern-Schaltfläche (eine Transaktion). Wer nur einen Bereich bearbeiten darf, bekommt von der
 * Datenbank nur dessen Vorlagen.
 *
 * Zwei Dinge stehen bewusst laut da:
 *
 * * **Wartende Mails.** Vorlagen werden beim Versand gerendert, nicht beim Einstellen in die Warteschlange. Wer den Text
 *   ändert, ändert die wartenden Mails mit. Das ist gewollt — so wirkt eine Korrektur noch —, aber niemand soll es
 *   erfahren, nachdem es passiert ist.
 * * **Unbekannte Platzhalter.** Ein `{{vorname}}`, das es im Code nicht gibt, bleibt beim Versand leer und fällt niemandem
 *   auf. Die erlaubten Platzhalter stehen an der Vorlage (`variables`); die Seite markiert, was darüber hinausgeht.
 */
export function VorlagenView({
  vorlagen,
  kategorien,
  festeKategorie,
  kannKategorie,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  vorlagen: Vorlage[];
  /** Anzeigenamen der Kategorien (Vokabular `mail_category`). */
  kategorien: Record<string, string>;
  /** Auf eine Kategorie festgelegt (Adresse je Bereich) — dann gibt es keinen Kategorie-Filter. */
  festeKategorie: MailKategorie | null;
  /** Darf die Kategorie einer Vorlage verschieben (nur admin). */
  kannKategorie: boolean;
  dateLocale: string;
  t: Strings;
  common: { cancel: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [suche, setSuche] = useState("");
  const [filterKat, setFilterKat] = useState("");
  const [offen, setOffen] = useState(vorlagen[0]?.key ?? "");
  const [sprache, setSprache] = useState<Sprache>("de");
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [vorschau, setVorschau] = useState<{ subject: string; html: string } | null>(null);
  const [historie, setHistorie] = useState<Verlauf[] | null>(null);
  const [meta, setMeta] = useState<{ name_de: string; name_en: string; category: string } | null>(null);
  const betreffRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fokus = useRef<"subject" | "body">("body");

  const zeit = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" });
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const aktuell = vorlagen.find((v) => v.key === offen) ?? null;

  const gefiltert = useMemo(
    () => vorlagen.filter((v) => (!filterKat || v.category === filterKat) && passt(v, suche)),
    [vorlagen, filterKat, suche],
  );
  const kategorienInListe = [...new Set(vorlagen.map((v) => v.category))];
  const gruppen = kategorienInListe
    .map((k) => ({ kategorie: k, zeilen: gefiltert.filter((v) => v.category === k) }))
    .filter((g) => g.zeilen.length > 0);

  const grund = aktuell ? basis(aktuell) : null;
  const text = entwurf ?? grund;
  const geaendert = (s: Sprache) =>
    Boolean(grund && entwurf && (entwurf[s].subject !== grund[s].subject || entwurf[s].body_md !== grund[s].body_md));
  const irgendwasGeaendert = SPRACHEN.some(geaendert);
  const fassung = aktuell?.[sprache] ?? null;

  /** Platzhalter im Text der gewählten Sprache, die die Vorlage nicht kennt — sie blieben beim Versand leer. */
  const unbekannte =
    aktuell && text ? unbekanntePlatzhalter(`${text[sprache].subject} ${text[sprache].body_md}`, aktuell.variables) : [];

  /** Knöpfe ohne brauchbare Adresse je Sprache — Speichern und Vorschau melden sie, statt einen toten Klick zu verschicken. */
  const knopfFehler = text ? SPRACHEN.filter((s) => knopfProbleme(text[s].body_md).length > 0) : [];
  const knopfFehlerHier = Boolean(text) && knopfProbleme(text![sprache].body_md).length > 0;

  function setzeFeld(feld: "subject" | "body_md", wert: string) {
    if (!grund) return;
    const alt = entwurf ?? grund;
    setEntwurf({ ...alt, [sprache]: { ...alt[sprache], [feld]: wert } });
  }

  /** Platzhalter an der Cursorposition des zuletzt benutzten Felds (Betreff oder Text) einsetzen (ADM-102 f). */
  function einfuegen(name: string) {
    const marke = `{{${name}}}`;
    const art = fokus.current;
    const feld = art === "subject" ? betreffRef.current : textRef.current;
    if (!feld || !text) return;
    const von = feld.selectionStart ?? feld.value.length;
    const bis = feld.selectionEnd ?? von;
    const neu = einsetzen(feld.value, von, bis, marke);
    // Als Eingabe ins Feld schreiben, damit Strg+Z weiter geht; nur wenn der Browser das ablehnt, den Zustand setzen.
    if (!ersetzeAlsEingabe(feld, neu.text)) setzeFeld(art === "subject" ? "subject" : "body_md", neu.text);
    requestAnimationFrame(() => {
      feld.focus();
      feld.setSelectionRange(neu.cursor, neu.cursor);
    });
  }

  /** Ein Werkzeug der Leiste auf den Text anwenden (ADM-102 f): Fett, Kursiv, Link, Liste, Überschrift, Knopf, Rückgängig/Wiederholen. */
  function formatieren(key: WerkzeugKey) {
    const feld = textRef.current;
    if (!feld) return;
    const w = WERKZEUGE[key];
    if (w.kind === "befehl") {
      verlaufBefehl(feld, w.befehl);
      return;
    }
    const neu = wendeAn(w, feld.value, feld.selectionStart, feld.selectionEnd, t.sampleText);
    if (!ersetzeAlsEingabe(feld, neu.text)) setzeFeld("body_md", neu.text);
    requestAnimationFrame(() => {
      feld.focus();
      feld.setSelectionRange(neu.start, neu.end);
    });
  }

  function report(res: VorlageResult<unknown>, okText: string) {
    if (res.ok) {
      toast("success", okText);
      setEntwurf(null);
      setHistorie(null);
      router.refresh();
      return;
    }
    toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
  }

  function waehlen(v: Vorlage) {
    setOffen(v.key);
    setEntwurf(null);
    setVorschau(null);
    setHistorie(null);
    setMeta(null);
  }

  function speichern() {
    if (!aktuell || !entwurf) return;
    const nimm = (s: Sprache): Fassungsdaten | null => (geaendert(s) ? entwurf[s] : null);
    startTransition(async () => report(await saveTemplatePair(aktuell.key, nimm("de"), nimm("en")), t.saved));
  }

  function metaSpeichern() {
    if (!aktuell || !meta) return;
    startTransition(async () => {
      const res = await setTemplateMeta(aktuell.key, {
        name_de: meta.name_de,
        name_en: meta.name_en,
        ...(kannKategorie && meta.category !== aktuell.category ? { category: meta.category } : {}),
      });
      if (res.ok) setMeta(null);
      report(res, t.metaSaved);
    });
  }

  const kategorieOptionen = Object.entries(kategorien).map(([value, label]) => ({ value, label }));

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="flex shrink-0 flex-col gap-4 lg:w-80">
        <div className="flex flex-col gap-3">
          <Field label={t.searchLabel} htmlFor="mv-suche">
            <SuchFeld id="mv-suche" value={suche} placeholder={t.searchPlaceholder} onChange={(e) => setSuche(e.target.value)} />
          </Field>
          {!festeKategorie && kategorienInListe.length > 1 && (
            <Field label={t.filterCategory} htmlFor="mv-kat">
              <Select
                id="mv-kat"
                value={filterKat}
                placeholder={t.allCategories}
                options={kategorienInListe.map((k) => ({ value: k, label: kategorien[k] ?? k }))}
                onChange={(e) => setFilterKat(e.target.value)}
              />
            </Field>
          )}
        </div>
        {gruppen.length === 0 && <p className="ct-small text-muted">{vorlagen.length === 0 ? t.empty : t.noResults}</p>}
        {gruppen.map((g) => (
          <section key={g.kategorie} aria-label={kategorien[g.kategorie] ?? g.kategorie} className="flex flex-col gap-1">
            {(gruppen.length > 1 || !festeKategorie) && (
              <h2 className="ct-eyebrow px-2.5 text-muted">{kategorien[g.kategorie] ?? g.kategorie}</h2>
            )}
            {g.zeilen.map((v) => (
              <button
                key={v.key}
                type="button"
                aria-current={offen === v.key ? "true" : undefined}
                onClick={() => waehlen(v)}
                className={cn(
                  "flex min-h-11 flex-col gap-0.5 rounded-ct-sm px-2.5 py-2 text-left transition-colors",
                  offen === v.key ? "bg-surface-hover text-ink" : "text-muted hover:bg-surface-hover hover:text-ink",
                )}
              >
                <span className="ct-label">{v.name_de}</span>
                <span className="ct-help truncate">{v.de?.subject ?? v.en?.subject}</span>
                <span className="flex flex-wrap gap-1">
                  {SPRACHEN.map((s) => (v[s] === null ? <Badge key={s} tone="warning">{s.toUpperCase()} {t.missing}</Badge> : null))}
                  {SPRACHEN.some((s) => v[s] && !v[s]!.active) && <Badge>{t.inactive}</Badge>}
                  {v.queued > 0 && <Badge tone="warning">{v.queued} {t.waiting}</Badge>}
                </span>
              </button>
            ))}
          </section>
        ))}
      </aside>

      {aktuell === null || text === null ? (
        <Card className="flex-1">
          <p className="ct-small text-muted">{t.empty}</p>
        </Card>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Card>
            <CardHeader
              ebene="h2"
              title={aktuell.name_de}
              description={`${t.internalKey}: ${aktuell.key}${aktuell.description ? ` · ${aktuell.description}` : ""}`}
            />

            {aktuell.queued > 0 && (
              <p className="ct-small mb-4 rounded-ct-md border border-warning-soft bg-warning-soft p-3 text-warning-ink">
                {aktuell.queued} {t.queuedWarning}
              </p>
            )}

            <div role="tablist" aria-label={t.languageLabel} className="mb-4 flex gap-2">
              {SPRACHEN.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  role="tab"
                  aria-selected={sprache === s}
                  variant={sprache === s ? "secondary" : "ghost"}
                  onClick={() => { setSprache(s); setVorschau(null); setHistorie(null); }}
                >
                  {s === "de" ? t.languageDe : t.languageEn}
                  {geaendert(s) && <span aria-label={t.unsavedMark} className="ml-1">•</span>}
                </Button>
              ))}
            </div>

            {fassung === null && <p className="ct-help mb-3 text-muted">{t.missingLanguage}</p>}

            <div className="flex flex-col gap-4">
              <Field label={t.subject} htmlFor="subject">
                <Input
                  id="subject"
                  ref={betreffRef}
                  value={text[sprache].subject}
                  onFocus={() => { fokus.current = "subject"; }}
                  onChange={(e) => setzeFeld("subject", e.target.value)}
                />
              </Field>
              <Field label={t.body} htmlFor="body" hint={t.bodyHint}>
                <div className="flex flex-col gap-2">
                  <FormatLeiste gruppen={MAIL_LEISTE} steuert="body" onAnwenden={formatieren} t={t} />
                  <Textarea
                    id="body"
                    ref={textRef}
                    rows={16}
                    className="font-mono"
                    value={text[sprache].body_md}
                    onFocus={() => { fokus.current = "body"; }}
                    onChange={(e) => setzeFeld("body_md", e.target.value)}
                  />
                </div>
              </Field>
              {knopfFehler.length > 0 && (
                <p role="alert" className="ct-small rounded-ct-md border border-error-soft bg-error-soft p-3 text-error-ink">
                  {t.buttonNeedsUrl.replace("{sprachen}", knopfFehler.map((s) => (s === "de" ? t.languageDe : t.languageEn)).join(", "))}
                </p>
              )}

              <div className="flex flex-col gap-2">
                <span className="ct-eyebrow text-muted">{t.placeholders}</span>
                <div className="flex flex-wrap gap-2">
                  {aktuell.variables.length === 0 && <span className="ct-help text-muted">{t.noPlaceholders}</span>}
                  {aktuell.variables.map((p) => (
                    <button
                      key={p}
                      type="button"
                      // Der Klick soll den Cursor im Feld lassen: ohne das nimmt der Knopf den Fokus, und die Position ginge verloren.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => einfuegen(p)}
                      className="min-h-8 rounded-ct-sm border border-border-strong bg-surface px-2 font-mono text-ink transition-colors hover:bg-surface-hover pointer-coarse:min-h-11"
                      title={t.insertHint}
                    >
                      {`{{${p}}}`}
                    </button>
                  ))}
                </div>
                <p className="ct-help text-muted">{t.insertHint}</p>
                {unbekannte.length > 0 && (
                  <p className="ct-help text-warning-ink">
                    {t.unknownPlaceholderWarning}{" "}
                    {unbekannte.map((p) => (
                      <Badge key={p} tone="warning">{`{{${p}}}`}</Badge>
                    ))}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 border-t pt-4">
              <Button disabled={pending || !irgendwasGeaendert || knopfFehler.length > 0} onClick={speichern}>
                {common.save}
              </Button>
              <Button
                variant="secondary"
                disabled={pending || knopfFehlerHier}
                onClick={() =>
                  startTransition(async () => {
                    const res = await previewTemplate(
                      text[sprache].subject,
                      text[sprache].body_md,
                      Object.fromEntries(platzhalter(`${text[sprache].subject} ${text[sprache].body_md}`).map((p) => [p, `«${p}»`])),
                    );
                    if (res.ok) setVorschau(res.data);
                  })
                }
              >
                {t.preview}
              </Button>
              <Button
                variant="ghost"
                disabled={pending || fassung === null}
                onClick={() => startTransition(async () => setHistorie(await loadHistory(aktuell.key, sprache)))}
              >
                {t.history}
              </Button>
              {irgendwasGeaendert && (
                <Button variant="ghost" disabled={pending} onClick={() => setEntwurf(null)}>
                  {common.cancel}
                </Button>
              )}
            </div>

            {fassung && (
              <p className="ct-help mt-3 text-muted">
                {t.version} {fassung.version} · {t.changed} {zeit.format(new Date(fassung.updated_at))}
                {fassung.updated_by_name ? ` · ${fassung.updated_by_name}` : ""} · {aktuell.sent_30d} {t.sent30d}
              </p>
            )}
          </Card>

          <Card>
            <CardHeader ebene="h2" title={t.nameSection} description={kannKategorie ? t.nameSectionBodyAdmin : t.nameSectionBody} />
            {meta === null ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="ct-small">
                  {aktuell.name_de} · {aktuell.name_en} · <Badge>{kategorien[aktuell.category] ?? aktuell.category}</Badge>
                </span>
                <Button size="sm" variant="secondary" onClick={() => setMeta({ name_de: aktuell.name_de, name_en: aktuell.name_en, category: aktuell.category })}>
                  {t.edit}
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t.nameDe} htmlFor="mv-name-de">
                  <Input id="mv-name-de" value={meta.name_de} onChange={(e) => setMeta({ ...meta, name_de: e.target.value })} />
                </Field>
                <Field label={t.nameEn} htmlFor="mv-name-en">
                  <Input id="mv-name-en" value={meta.name_en} onChange={(e) => setMeta({ ...meta, name_en: e.target.value })} />
                </Field>
                {kannKategorie && (
                  <Field label={t.category} htmlFor="mv-category" hint={t.categoryHint}>
                    <Select id="mv-category" value={meta.category} options={kategorieOptionen} onChange={(e) => setMeta({ ...meta, category: e.target.value })} />
                  </Field>
                )}
                <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
                  <Button disabled={pending || !meta.name_de.trim() || !meta.name_en.trim()} onClick={metaSpeichern}>{common.save}</Button>
                  <Button variant="ghost" disabled={pending} onClick={() => setMeta(null)}>{common.cancel}</Button>
                </div>
              </div>
            )}
          </Card>

          {vorschau && (
            <Card>
              <CardHeader ebene="h2" title={t.previewTitle} description={t.previewHint} />
              <p className="ct-label mb-2 text-ink">{vorschau.subject}</p>
              {/* Die Vorschau zeigt genau das HTML, das der Versand erzeugt — deshalb wird es hier eingesetzt und nicht nachgebaut. */}
              <div className="rounded-ct-md border bg-surface p-4" dangerouslySetInnerHTML={{ __html: vorschau.html }} />
            </Card>
          )}

          {historie && (
            <Card>
              <CardHeader ebene="h2" title={t.historyTitle} description={t.historyHint} />
              {historie.length === 0 ? (
                <p className="ct-small text-muted">{t.historyEmpty}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {historie.map((f, i) => (
                    <li key={`${f.changed_at}-${i}`} className="border-b pb-3 last:border-0">
                      <p className="ct-help text-muted">
                        {zeit.format(new Date(f.changed_at))}
                        {f.changed_by ? ` · ${f.changed_by}` : ""}
                        {f.version_after ? ` · → v${f.version_after}` : ""}
                      </p>
                      <p className="ct-small mt-1 font-medium">{f.subject_before}</p>
                      <pre className="ct-help mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-muted">{f.body_before}</pre>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending || !f.subject_before || !f.body_before}
                        onClick={() =>
                          startTransition(async () =>
                            report(await restoreTemplate(aktuell.key, sprache, f.subject_before ?? "", f.body_before ?? ""), t.restored),
                          )
                        }
                      >
                        {t.restore}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
