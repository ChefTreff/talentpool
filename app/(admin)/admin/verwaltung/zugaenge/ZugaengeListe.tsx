"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { SuchFeld } from "@/components/ui/SuchFeld";
import { ConfirmDialog } from "@/components/ui/Modal";
import { ladeEin, setzeZugang } from "./actions";

export type Konto = {
  person_id: string; name: string | null; email: string | null;
  has_login: boolean; blocked_at: string | null; roles: string[]; total: number;
};

type Frage = { art: "sperren" | "oeffnen" | "einladen"; konto: Konto };

/**
 * Die Liste der Zugänge mit den drei Handgriffen: einladen, sperren, wieder
 * öffnen.
 *
 * Jeder davon fragt nach. Ein Zugang ist nichts, was man im Vorbeigehen
 * umlegt — und die Rückfrage sagt jeweils, was danach gilt, statt nur „Sicher?".
 */
export function ZugaengeListe({
  konten, suche, seite, proSeite, selbst, t, common, rpcMessages,
}: {
  konten: Konto[];
  suche: string;
  seite: number;
  proSeite: number;
  selbst: string | null;
  t: Record<string, string>;
  common: Record<string, string>;
  rpcMessages: Record<string, string>;
}) {
  const [frage, setFrage] = useState<Frage | null>(null);
  const [notiz, setNotiz] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const melden = (key: string, detail?: string) =>
    setFehler((rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : ""));

  const gesamt = konten[0]?.total ?? 0;
  const seiten = Math.max(1, Math.ceil(gesamt / proSeite));
  const mitSeite = (n: number) => {
    const p = new URLSearchParams();
    if (suche) p.set("q", suche);
    if (n > 1) p.set("seite", String(n));
    return `/admin/verwaltung/zugaenge${p.size ? `?${p}` : ""}`;
  };

  const ausfuehren = () => {
    if (!frage) return;
    const { art, konto } = frage;
    start(async () => {
      const res =
        art === "einladen"
          ? await ladeEin(konto.person_id)
          : await setzeZugang(konto.person_id, art === "sperren", notiz);
      setFrage(null);
      setNotiz("");
      if (res.ok) setHinweis(art === "einladen" ? t.invited : null);
      else melden(res.key, "detail" in res ? res.detail : undefined);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {fehler && (
        <p role="alert" className="rounded-ct-md border border-error-soft bg-error-soft p-3 ct-small text-error-ink">
          {fehler}
        </p>
      )}
      {hinweis && <p className="rounded-ct-md border bg-surface p-3 ct-small text-ink">{hinweis}</p>}

      <form className="flex flex-wrap items-end gap-2" action="/admin/verwaltung/zugaenge">
        <label className="min-w-64 flex-1">
          <span className="ct-label mb-1 block text-ink">{t.searchLabel}</span>
          <SuchFeld name="q" defaultValue={suche} placeholder={t.searchPlaceholder} />
        </label>
        <Button type="submit" size="sm">{t.search}</Button>
      </form>

      {konten.length === 0 ? (
        <EmptyState title={t.empty} description={t.emptyBody} />
      ) : (
        <>
          <p className="ct-label text-ink">{t.count.replace("{n}", String(gesamt))}</p>
          <Card>
            <ul className="flex flex-col divide-y">
              {konten.map((k) => (
                <li key={k.person_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                  <span className="ct-label text-ink">{k.name ?? "—"}</span>
                  {k.email && <span className="ct-help">{k.email}</span>}
                  <span className="ct-help">{k.roles.length ? k.roles.join(", ") : t.noRoles}</span>
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    <Badge tone={k.has_login ? "neutral" : "warning"}>
                      {k.has_login ? t.hasLogin : t.noLogin}
                    </Badge>
                    <Badge tone={k.blocked_at ? "warning" : "success"}>
                      {k.blocked_at ? t.blocked : t.active}
                    </Badge>
                    {k.email && !k.blocked_at && (
                      <Button size="sm" variant="ghost" disabled={pending}
                              onClick={() => { setFehler(null); setHinweis(null); setFrage({ art: "einladen", konto: k }); }}>
                        {t.invite}
                      </Button>
                    )}
                    {/* Den eigenen Zugang gar nicht erst anbieten: die Datenbank
                        weist es ab, aber ein Knopf, der immer scheitert, ist
                        eine Falle. */}
                    {k.person_id !== selbst ? (
                      <Button size="sm" variant="ghost" disabled={pending}
                              onClick={() => { setFehler(null); setHinweis(null); setFrage({ art: k.blocked_at ? "oeffnen" : "sperren", konto: k }); }}>
                        {k.blocked_at ? t.unblock : t.block}
                      </Button>
                    ) : (
                      <span className="ct-help">{t.selfHint}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <div className="flex flex-wrap items-center gap-3">
            <span className="ct-help">
              {t.page.replace("{seite}", String(seite)).replace("{seiten}", String(seiten))}
            </span>
            {seite > 1 && <Link className="ct-link ct-small" href={mitSeite(seite - 1)}>{t.prev}</Link>}
            {seite < seiten && <Link className="ct-link ct-small" href={mitSeite(seite + 1)}>{t.next}</Link>}
          </div>
        </>
      )}

      {frage && (
        <ConfirmDialog
          title={frage.art === "einladen" ? t.inviteTitle : frage.art === "sperren" ? t.blockTitle : t.unblockTitle}
          body={frage.art === "einladen" ? t.inviteBody : frage.art === "sperren" ? t.blockBody : t.unblockBody}
          detail={
            <span className="flex flex-col gap-3">
              <span className="ct-label text-ink">
                {frage.konto.name ?? frage.konto.email ?? frage.konto.person_id}
              </span>
              {/* Die Notiz steht im Audit-Log. „Warum" ist die Frage, die man in
                  einem halben Jahr stellt, und dann ist niemand mehr da, der
                  sie beantworten kann. */}
              {frage.art !== "einladen" && (
                <Field label={t.noteLabel} htmlFor="zg-note">
                  <Input id="zg-note" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
                </Field>
              )}
            </span>
          }
          confirmLabel={frage.art === "einladen" ? t.invite : frage.art === "sperren" ? t.block : t.unblock}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => { setFrage(null); setNotiz(""); }}
          onConfirm={ausfuehren}
        />
      )}
    </div>
  );
}
