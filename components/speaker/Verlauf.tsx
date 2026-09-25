"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  MAX_EINTRAG,
  VERLAUF_ARTEN,
  fristStand,
  heute,
  type VerlaufEintrag,
} from "@/lib/speaker/verlauf";
import { aendern, eintragen, erledigen, ladeVerlauf, loeschen, type VerlaufResult } from "./verlauf-actions";

type Strings = Record<string, string>;

/**
 * Der Verlauf eines Speakers (LEAD-039 Schnitt 2): Notizen, Kontakte und
 * Aufgaben mit Frist, oben das Formular, darunter die Einträge — offene
 * Aufgaben zuerst, dann der Rest, neuester zuerst.
 *
 * Konrad (K-36 F1): Stage Leads sehen den ganzen Verlauf der Speaker ihrer
 * Bühne; ändern und löschen darf man eigene Einträge (das Team alle), abhaken
 * dürfen Autor, Zuständige, Owner und Team — die RPC sagt je Zeile, was geht
 * (`can_edit`, `can_complete`).
 */
export function Verlauf({
  profileId,
  meId,
  zustaendige,
  arten,
  dateLocale,
  t,
  rpcMessages,
}: {
  profileId: string;
  meId: string;
  /** Wer als Zuständige einer Aufgabe in Frage kommt (Speaker-Leads). */
  zustaendige: { id: string; name: string }[];
  /** Bezeichnungen aus `speaker_activity_kind`. */
  arten: Record<string, string>;
  dateLocale: string;
  /** `speakerVerlauf`-Texte. */
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [eintraege, setEintraege] = useState<VerlaufEintrag[] | null>(null);
  // Einmal je Mount — der Kalendertag hängt an der Uhr.
  const [heuteIso] = useState(() => heute());
  const [art, setArt] = useState<string>("note");
  const [text, setText] = useState("");
  const [wann, setWann] = useState(heuteIso);
  const [faellig, setFaellig] = useState(heuteIso);
  const [zustaendig, setZustaendig] = useState(meId);
  const [bearbeitet, setBearbeitet] = useState<{ id: string; body: string } | null>(null);
  /** Eintrag, dessen Löschen gerade bestätigt wird — Löschen lässt sich nicht zurücknehmen. */
  const [zuLoeschen, setZuLoeschen] = useState<string | null>(null);

  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  const laden = useCallback(async () => {
    const res = await ladeVerlauf(profileId);
    if (res.ok) setEintraege(res.data);
    else setEintraege([]);
  }, [profileId]);

  useEffect(() => {
    let lebt = true;
    ladeVerlauf(profileId).then((res) => {
      if (lebt) setEintraege(res.ok ? res.data : []);
    });
    return () => {
      lebt = false;
    };
  }, [profileId]);

  function nachher(res: VerlaufResult<unknown>, okText: string): boolean {
    if (!res.ok) {
      toast("error", message(res.key));
      return false;
    }
    toast("success", okText);
    void laden();
    router.refresh();
    return true;
  }

  function neu() {
    const body = text.trim();
    if (!body) return;
    startTransition(async () => {
      const ok = nachher(
        await eintragen(profileId, {
          kind: art,
          body,
          // Nur ein anderes Datum als heute schicken — sonst gilt die Uhrzeit des Eintragens.
          occurredAt: art !== "task" && wann && wann !== heuteIso ? new Date(`${wann}T12:00:00`).toISOString() : null,
          dueOn: art === "task" ? faellig : null,
          assigneeId: art === "task" ? zustaendig : null,
        }),
        t.added,
      );
      if (ok) setText("");
    });
  }

  const ton = (e: VerlaufEintrag): BadgeTone => {
    if (e.kind !== "task") return "neutral";
    if (e.done_at) return "success";
    const stand = fristStand(e.due_on ?? heuteIso, heuteIso);
    return stand === "ueberfaellig" ? "error" : stand === "heute" ? "warning" : "accent";
  };
  const fristText = (e: VerlaufEintrag) => {
    if (e.done_at) return t.completedOn.replace("{date}", datum.format(new Date(e.done_at)));
    if (!e.due_on) return "";
    const stand = fristStand(e.due_on, heuteIso);
    if (stand === "ueberfaellig") return `${t.overdue} · ${t.dueOn.replace("{date}", datum.format(new Date(`${e.due_on}T12:00:00`)))}`;
    if (stand === "heute") return t.dueToday;
    return t.dueOn.replace("{date}", datum.format(new Date(`${e.due_on}T12:00:00`)));
  };

  const artOptionen = VERLAUF_ARTEN.map((a) => ({ value: a, label: arten[a] ?? a }));
  const leute = [
    { value: meId, label: t.me },
    ...zustaendige.filter((z) => z.id !== meId).map((z) => ({ value: z.id, label: z.name })),
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Neuer Eintrag */}
      <div className="flex flex-col gap-3 rounded-ct-md border bg-canvas p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.kind} htmlFor={`verlauf-art-${profileId}`}>
            <Select
              id={`verlauf-art-${profileId}`}
              value={art}
              options={artOptionen}
              disabled={pending}
              onChange={(e) => setArt(e.target.value)}
            />
          </Field>
          {art === "task" ? (
            <Field label={t.due} htmlFor={`verlauf-faellig-${profileId}`}>
              <Input
                id={`verlauf-faellig-${profileId}`}
                type="date"
                value={faellig}
                disabled={pending}
                onChange={(e) => setFaellig(e.target.value)}
              />
            </Field>
          ) : (
            <Field label={t.when} htmlFor={`verlauf-wann-${profileId}`}>
              <Input
                id={`verlauf-wann-${profileId}`}
                type="date"
                value={wann}
                max={heuteIso}
                disabled={pending}
                onChange={(e) => setWann(e.target.value)}
              />
            </Field>
          )}
        </div>
        {art === "task" && (
          <Field label={t.assignee} htmlFor={`verlauf-zustaendig-${profileId}`}>
            <Select
              id={`verlauf-zustaendig-${profileId}`}
              value={zustaendig}
              options={leute}
              disabled={pending}
              onChange={(e) => setZustaendig(e.target.value)}
            />
          </Field>
        )}
        <Field label={t.body} htmlFor={`verlauf-text-${profileId}`}>
          <Textarea
            id={`verlauf-text-${profileId}`}
            rows={2}
            maxLength={MAX_EINTRAG}
            value={text}
            placeholder={t.bodyPlaceholder}
            disabled={pending}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <div>
          <Button
            size="sm"
            onClick={neu}
            loading={pending}
            disabled={text.trim() === "" || (art === "task" && !faellig)}
          >
            {t.add}
          </Button>
        </div>
      </div>

      {/* Einträge */}
      {eintraege === null ? (
        <p className="ct-help">{t.loading}</p>
      ) : eintraege.length === 0 ? (
        <p className="ct-help">{t.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {eintraege.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 border-b pb-3 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={ton(e)}>{arten[e.kind] ?? e.kind}</Badge>
                {e.kind === "task" && <span className="ct-help">{fristText(e)}</span>}
                <span className="ct-help">
                  {datum.format(new Date(e.occurred_at))}
                  {e.author_name ? ` · ${t.by.replace("{name}", e.author_name)}` : ""}
                  {e.kind === "task" && e.assignee_name ? ` · ${t.assignee}: ${e.assignee_name}` : ""}
                </span>
              </div>
              {bearbeitet?.id === e.id ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    aria-label={t.body}
                    rows={2}
                    maxLength={MAX_EINTRAG}
                    value={bearbeitet.body}
                    disabled={pending}
                    onChange={(ev) => setBearbeitet({ id: e.id, body: ev.target.value })}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={pending || bearbeitet.body.trim() === ""}
                      onClick={() =>
                        startTransition(async () => {
                          if (nachher(await aendern(profileId, e.id, { body: bearbeitet.body.trim() }), t.saved)) {
                            setBearbeitet(null);
                          }
                        })
                      }
                    >
                      {t.save}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setBearbeitet(null)}>
                      {t.cancel}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="ct-small whitespace-pre-line text-ink">{e.body}</p>
              )}
              {(e.can_complete || e.can_edit) && bearbeitet?.id !== e.id && (
                <div className="flex flex-wrap gap-1">
                  {e.can_complete && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          nachher(await erledigen(profileId, e.id, !e.done_at), e.done_at ? t.open : t.done);
                        })
                      }
                    >
                      {e.done_at ? t.reopen : t.markDone}
                    </Button>
                  )}
                  {e.can_edit && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setBearbeitet({ id: e.id, body: e.body })}
                      >
                        {t.edit}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setZuLoeschen(e.id)}>
                        {t.delete}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {zuLoeschen && (
        <ConfirmDialog
          title={t.deleteConfirmTitle}
          body={t.deleteConfirmBody}
          confirmLabel={t.delete}
          cancelLabel={t.cancel}
          pending={pending}
          onCancel={() => setZuLoeschen(null)}
          onConfirm={() =>
            startTransition(async () => {
              const id = zuLoeschen;
              setZuLoeschen(null);
              nachher(await loeschen(profileId, id), t.deleted);
            })
          }
        />
      )}
    </div>
  );
}
