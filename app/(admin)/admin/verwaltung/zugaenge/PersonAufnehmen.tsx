"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { SuchFeld } from "@/components/ui/SuchFeld";
import { useToast } from "@/components/ui/Toast";
import { findPeople, grantTeamRole, type GefundenePerson } from "./actions";
import { useSchubfachSchliessen } from "./ZugaengeKopf";

/**
 * Eine Person aus dem Talentpool mit einer Rolle ins Team aufnehmen — für den Fall, dass sie noch **gar keine**
 * Rolle und kein Konto hat und deshalb nicht in der Liste steht (vorher die untere Karte von `/admin/team`).
 * Neue Menschen legt „Teammitglied einladen“ an; hier kommt nur jemand dazu, der schon im Talentpool steht.
 *
 * **Steht im Schubfach „Teammitglied hinzufügen“** (ADM-109), zweiter der zwei Wege — vorher ein zugeklapptes Feld ganz unten auf
 * der Seite, das man nicht fand. Ohne eigene Karte; nach dem Erfolg schließt es das Schubfach; ein Fehler steht unter der Liste,
 * nicht als Toast.
 */
export function PersonAufnehmen({
  rollen,
  editionId,
  editionName,
  t,
  common,
  rpcMessages,
}: {
  rollen: { value: string; label: string }[];
  editionId: string | null;
  editionName: string | null;
  t: Record<string, string>;
  common: { choose: string; none: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const schliessen = useSchubfachSchliessen();
  const [pending, start] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState<GefundenePerson[]>([]);
  const [gesucht, setGesucht] = useState(false);
  const [rolle, setRolle] = useState("");
  const [scope, setScope] = useState("global");

  return (
    <div className="flex flex-col gap-4">
      <p className="ct-help">{t.addHint}</p>
      <div className="flex flex-col gap-3">
        <Field label={t.searchLabel} htmlFor="pa-q">
          <SuchFeld id="pa-q" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t.searchPlaceholder} />
        </Field>
        <Field label={t.role} htmlFor="pa-rolle">
          <Select id="pa-rolle" value={rolle} placeholder={common.choose} onChange={(e) => setRolle(e.target.value)} options={rollen} />
        </Field>
        {/* Der Admin ist bewusst nie auf eine Edition begrenzt. */}
        <Field label={t.scope} htmlFor="pa-scope">
          <Select
            id="pa-scope"
            value={rolle === "admin" ? "global" : scope}
            disabled={rolle === "admin" || !editionId}
            onChange={(e) => setScope(e.target.value)}
            options={[
              { value: "global", label: t.scopeGlobal },
              ...(editionId ? [{ value: "edition", label: editionName ?? t.scopeEdition }] : []),
            ]}
          />
        </Field>
        <div>
        <Button
          variant="secondary"
          disabled={pending || suche.trim().length < 2}
          onClick={() => start(async () => { setTreffer(await findPeople(suche.trim())); setGesucht(true); })}
        >
          {t.search}
        </Button>
        </div>
      </div>

      {gesucht && treffer.length === 0 && <p className="ct-help text-muted">{t.noMatch}</p>}
      {treffer.length > 0 && (
        <ul className="flex flex-col gap-2">
          {treffer.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
              <span className="ct-small">
                {p.display_name ?? common.none}
                {p.email && <span className="ct-help block text-muted">{p.email}</span>}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending || rolle === ""}
                onClick={() =>
                  start(async () => {
                    const res = await grantTeamRole(p.id, rolle, scope === "edition" ? editionId : null);
                    if (res.ok) {
                      setFehler(null);
                      toast("success", t.granted);
                      router.refresh();
                      schliessen();
                    } else {
                      setFehler((rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key) + (res.detail ? ` (${res.detail})` : ""));
                    }
                  })
                }
              >
                {t.add}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {fehler && <p className="ct-small text-error-ink" role="alert">{fehler}</p>}
    </div>
  );
}
