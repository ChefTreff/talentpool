"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import {
  loadHistory,
  previewTemplate,
  restoreTemplate,
  saveTemplate,
  type Fassung,
  type VorlageResult,
} from "./actions";

type Strings = Record<string, string>;

export type Vorlage = {
  key: string;
  locale: string;
  subject: string;
  body_md: string;
  description: string | null;
  active: boolean;
  version: number;
  updated_at: string;
  updated_by_name: string | null;
  /** Mails, die gerade auf genau diese Vorlage warten. */
  queued: number;
  sent_30d: number;
};

/** `{{name}}` aus einem Text ziehen — dieselbe Form, die `fillVars` ersetzt. */
function platzhalter(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)].map((m) => m[1]))];
}

/**
 * Mail-Vorlagen bearbeiten.
 *
 * Konrad: „Man hat ja immer wieder kleine Änderungen." Genau dafür ist die
 * Seite gebaut — links die Liste, rechts der Text, Vorschau daneben.
 *
 * Zwei Dinge stehen bewusst laut da:
 *
 * * **Wartende Mails.** Vorlagen werden beim Versand gerendert, nicht beim
 *   Einstellen in die Warteschlange. Wer den Text ändert, ändert die wartenden
 *   Mails mit. Das ist gewollt — so wirkt eine Korrektur noch —, aber niemand
 *   soll es erfahren, nachdem es passiert ist.
 * * **Neue Platzhalter.** Ein `{{vorname}}`, das es im Code nicht gibt, bleibt
 *   beim Versand leer und fällt niemandem auf. Die Seite vergleicht deshalb mit
 *   dem gespeicherten Stand und markiert, was neu dazugekommen ist.
 */
export function VorlagenView({
  vorlagen,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  vorlagen: Vorlage[];
  dateLocale: string;
  t: Strings;
  common: { cancel: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [offen, setOffen] = useState(vorlagen[0] ? `${vorlagen[0].key}|${vorlagen[0].locale}` : "");
  const [entwurf, setEntwurf] = useState<{ subject: string; body: string } | null>(null);
  const [vorschau, setVorschau] = useState<{ subject: string; html: string } | null>(null);
  const [historie, setHistorie] = useState<Fassung[] | null>(null);

  const zeit = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" });
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const aktuell = vorlagen.find((v) => `${v.key}|${v.locale}` === offen) ?? null;

  const subject = entwurf?.subject ?? aktuell?.subject ?? "";
  const body = entwurf?.body ?? aktuell?.body_md ?? "";
  const geaendert =
    aktuell !== null && (subject !== aktuell.subject || body !== aktuell.body_md);

  /** Platzhalter, die im Entwurf stehen, aber nicht im gespeicherten Stand. */
  const neuePlatzhalter = useMemo(() => {
    if (!aktuell) return [];
    const alt = new Set([...platzhalter(aktuell.subject), ...platzhalter(aktuell.body_md)]);
    return [...platzhalter(subject), ...platzhalter(body)].filter((p) => !alt.has(p));
  }, [aktuell, subject, body]);

  function report(res: VorlageResult<number>, okText: string) {
    if (res.ok) {
      toast("success", `${okText} (v${res.data})`);
      setEntwurf(null);
      setHistorie(null);
      router.refresh();
      return;
    }
    toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
  }

  function waehlen(v: Vorlage) {
    setOffen(`${v.key}|${v.locale}`);
    setEntwurf(null);
    setVorschau(null);
    setHistorie(null);
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="flex shrink-0 flex-col gap-1 lg:w-[280px]">
        {vorlagen.map((v) => (
          <button
            key={`${v.key}|${v.locale}`}
            type="button"
            aria-current={offen === `${v.key}|${v.locale}` ? "true" : undefined}
            onClick={() => waehlen(v)}
            className={cn(
              "flex flex-col gap-0.5 rounded-ct-sm px-2.5 py-2 text-left transition-colors",
              offen === `${v.key}|${v.locale}`
                ? "bg-surface-hover text-ink"
                : "text-muted hover:bg-surface-hover hover:text-ink",
            )}
          >
            <span className="ct-label">
              {v.key} · {v.locale.toUpperCase()}
            </span>
            <span className="ct-help truncate">{v.subject}</span>
            <span className="flex gap-1">
              {!v.active && <Badge>{t.inactive}</Badge>}
              {v.queued > 0 && <Badge tone="warning">{v.queued} {t.waiting}</Badge>}
            </span>
          </button>
        ))}
      </aside>

      {aktuell === null ? (
        <Card className="flex-1">
          <p className="ct-small text-muted">{t.empty}</p>
        </Card>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Card>
            <CardHeader
              title={`${aktuell.key} · ${aktuell.locale.toUpperCase()}`}
              description={aktuell.description ?? undefined}
            />

            {/* Der Satz, um den es geht: eine Änderung wirkt auf die wartenden
                Mails. Er steht über dem Feld, nicht darunter. */}
            {aktuell.queued > 0 && (
              <p className="ct-small mb-4 rounded-ct-md border border-warning-soft bg-warning-soft p-3 text-warning-ink">
                {aktuell.queued} {t.queuedWarning}
              </p>
            )}

            <div className="flex flex-col gap-4">
              <Field label={t.subject} htmlFor="subject">
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setEntwurf({ subject: e.target.value, body })}
                />
              </Field>
              <Field label={t.body} htmlFor="body" hint={t.bodyHint}>
                <Textarea
                  id="body"
                  rows={16}
                  className="font-mono"
                  value={body}
                  onChange={(e) => setEntwurf({ subject, body: e.target.value })}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-2">
                <span className="ct-eyebrow text-muted">{t.placeholders}</span>
                {platzhalter(`${subject} ${body}`).map((p) => (
                  <Badge key={p} tone={neuePlatzhalter.includes(p) ? "warning" : "neutral"}>
                    {`{{${p}}}`}
                  </Badge>
                ))}
              </div>
              {neuePlatzhalter.length > 0 && (
                <p className="ct-help text-warning-ink">{t.newPlaceholderWarning}</p>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-2 border-t pt-4">
              <Button
                disabled={pending || !geaendert}
                onClick={() =>
                  startTransition(async () =>
                    report(
                      await saveTemplate({
                        key: aktuell.key,
                        locale: aktuell.locale,
                        subject,
                        body_md: body,
                      }),
                      t.saved,
                    ),
                  )
                }
              >
                {common.save}
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await previewTemplate(
                      subject,
                      body,
                      Object.fromEntries(
                        platzhalter(`${subject} ${body}`).map((p) => [p, `«${p}»`]),
                      ),
                    );
                    if (res.ok) setVorschau(res.data);
                  })
                }
              >
                {t.preview}
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(async () =>
                    setHistorie(await loadHistory(aktuell.key, aktuell.locale)),
                  )
                }
              >
                {t.history}
              </Button>
              {geaendert && (
                <Button variant="ghost" disabled={pending} onClick={() => setEntwurf(null)}>
                  {common.cancel}
                </Button>
              )}
            </div>

            <p className="ct-help mt-3 text-muted">
              {t.version} {aktuell.version} · {t.changed} {zeit.format(new Date(aktuell.updated_at))}
              {aktuell.updated_by_name ? ` · ${aktuell.updated_by_name}` : ""} ·{" "}
              {aktuell.sent_30d} {t.sent30d}
            </p>
          </Card>

          {vorschau && (
            <Card>
              <CardHeader title={t.previewTitle} description={t.previewHint} />
              <p className="ct-label mb-2 text-ink">{vorschau.subject}</p>
              {/* Die Vorschau zeigt genau das HTML, das der Versand erzeugt —
                  deshalb wird es hier eingesetzt und nicht nachgebaut. */}
              <div
                className="rounded-ct-md border bg-surface p-4"
                dangerouslySetInnerHTML={{ __html: vorschau.html }}
              />
            </Card>
          )}

          {historie && (
            <Card>
              <CardHeader title={t.historyTitle} description={t.historyHint} />
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
                      <pre className="ct-help mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-muted">
                        {f.body_before}
                      </pre>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending || !f.subject_before || !f.body_before}
                        onClick={() =>
                          startTransition(async () =>
                            report(
                              await restoreTemplate(
                                aktuell.key,
                                aktuell.locale,
                                f.subject_before ?? "",
                                f.body_before ?? "",
                              ),
                              t.restored,
                            ),
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
