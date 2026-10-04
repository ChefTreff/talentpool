"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { MehrfachAuswahl } from "@/components/ui/MehrfachAuswahl";
import { useToast } from "@/components/ui/Toast";
import {
  answerRequest,
  invitePerson,
  requestJoin,
  setSeeking,
  setTeamLooking,
  withdrawRequest,
} from "@/app/(hackathon)/hackathon/actions";
import type { Beitrittsanfrage, OffenesTeam, SuchendePerson } from "@/app/(hackathon)/hackathon/types";

type Strings = Record<string, string>;

/**
 * Teamsuche (HACK-016). Wer ohne Team ist, sieht offene Teams und fragt an;
 * Teams sehen Personen mit „suche Team“ und laden ein. Zugesagt wird immer von
 * der Gegenseite (Kapitän bzw. Person). Angezeigt werden nur Vorname,
 * Studienfeld, Skills und Track-Wunsch — nie Kontaktdaten; die Regeln stehen
 * in den Definer-Funktionen (`v6_hack_teamsuche`).
 */
export function Teamsuche({
  modus,
  seeking,
  teams,
  people,
  requests,
  myTeam,
  labels,
  t,
  rpcMessages,
}: {
  modus: "solo" | "kapitaen" | "mitglied";
  seeking: boolean;
  teams: OffenesTeam[];
  people: SuchendePerson[];
  requests: Beitrittsanfrage[];
  myTeam: { looking: boolean; skills: string[]; note: string } | null;
  labels: { skills: Record<string, string>; studyFields: Record<string, string>; tracks: Record<string, string> };
  t: Strings;
  rpcMessages: Strings;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [looking, setLooking] = useState(myTeam?.looking ?? false);
  const [skills, setSkills] = useState<string[]>(myTeam?.skills ?? []);
  const [note, setNote] = useState(myTeam?.note ?? "");

  function run(action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) {
    start(async () => {
      const res = await action;
      if (!res.ok) {
        toast("error", rpcMessages[res.key ?? "unknown"] ?? rpcMessages.unknown ?? res.key ?? "");
        return;
      }
      toast("success", okText);
      router.refresh();
    });
  }

  const skill = (k: string) => labels.skills[k] ?? k;
  const offen = requests.filter((r) => r.status === "pending");

  return (
    <Card>
      <CardHeader ebene="h2" title={t.searchTitle} description={modus === "solo" ? t.searchLeadSolo : t.searchLeadTeam} />
      <div className="flex flex-col gap-6">
        {/* Offene Anfragen und Einladungen zuerst — dort wartet jemand auf eine Antwort. */}
        {offen.length > 0 && (
          <section className="flex flex-col gap-2" aria-label={t.requestsTitle}>
            <h3 className="ct-label">{t.requestsTitle}</h3>
            <ul className="flex flex-col gap-2">
              {offen.map((r) => (
                <li key={r.request_id} className="flex flex-wrap items-center gap-3">
                  <span>
                    {r.direction === "to_team"
                      ? t.requestToTeam.replace("{person}", r.person_first_name ?? "—").replace("{team}", r.team_name)
                      : t.requestToPerson.replace("{person}", r.person_first_name ?? "—").replace("{team}", r.team_name)}
                  </span>
                  {r.message && <span className="ct-help">„{r.message}“</span>}
                  {r.mine_to_answer ? (
                    <>
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(answerRequest(r.request_id, true), t.requestAccepted)}>
                        {t.accept}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(answerRequest(r.request_id, false), t.requestDeclined)}>
                        {t.decline}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge tone="warning">{t.requestWaiting}</Badge>
                      {((modus === "solo" && r.direction === "to_team") || (modus === "kapitaen" && r.direction === "to_person")) && (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(withdrawRequest(r.request_id), t.requestWithdrawn)}>
                          {t.withdraw}
                        </Button>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {modus === "solo" && (
          <>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={seeking}
                disabled={pending}
                onChange={(e) => run(setSeeking(e.target.checked), e.target.checked ? t.seekingOn : t.seekingOff)}
              />
              <span>{t.seeking}</span>
            </label>
            <p className="ct-help -mt-4">{t.seekingHint}</p>
            {teams.length === 0 ? (
              <p className="ct-help">{t.teamsNone}</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {teams.map((tm) => (
                  <li key={tm.team_id} className="flex flex-col gap-2 border-t pt-3">
                    <div className="flex flex-wrap items-baseline gap-3">
                      <span className="ct-h3">{tm.team_name}</span>
                      <span className="ct-help tabular-nums">{t.freeSlots.replace("{n}", String(tm.free_slots))}</span>
                    </div>
                    {(tm.challenge_title || tm.track) && (
                      <p className="ct-small text-muted">
                        {[tm.challenge_title, tm.track ? (labels.tracks[tm.track] ?? tm.track) : null].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {tm.looking_note && <p className="ct-small">{tm.looking_note}</p>}
                    {tm.looking_skills.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {tm.looking_skills.map((k) => (
                          <Badge key={k} tone="neutral">{skill(k)}</Badge>
                        ))}
                      </div>
                    )}
                    <div>
                      {tm.my_request ? (
                        <Badge tone="warning">{tm.my_request === "to_team" ? t.requestWaiting : t.invitedYou}</Badge>
                      ) : (
                        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(requestJoin(tm.team_id, ""), t.requestSent)}>
                          {t.askToJoin}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {modus === "kapitaen" && (
          <section className="flex flex-col gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-5 w-5" checked={looking} disabled={pending} onChange={(e) => setLooking(e.target.checked)} />
              <span>{t.looking}</span>
            </label>
            {looking && (
              <>
                <Field label={t.lookingSkills} htmlFor="looking-skills" hint={t.lookingSkillsHint}>
                  <MehrfachAuswahl
                    id="looking-skills"
                    options={Object.entries(labels.skills).map(([value, label]) => ({ value, label }))}
                    value={skills}
                    onChange={(v) => setSkills(v.slice(0, 8))}
                    placeholder={t.searchSkills}
                    disabled={pending}
                    t={{ remove: t.remove, noHits: t.noHits }}
                  />
                </Field>
                <Field label={t.lookingNote} htmlFor="looking-note" hint={t.lookingNoteHint}>
                  <Input id="looking-note" maxLength={200} value={note} disabled={pending} onChange={(e) => setNote(e.target.value)} />
                </Field>
              </>
            )}
            <div>
              <Button variant="secondary" disabled={pending} onClick={() => run(setTeamLooking({ looking, skills, note }), t.lookingSaved)}>
                {t.lookingSave}
              </Button>
            </div>
          </section>
        )}

        {modus !== "solo" && (
          <section className="flex flex-col gap-2">
            <h3 className="ct-label">{t.peopleTitle}</h3>
            {modus === "mitglied" && <p className="ct-help">{t.captainInvites}</p>}
            {people.length === 0 ? (
              <p className="ct-help">{t.peopleNone}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {people.map((p) => (
                  <li key={p.person_id} className="flex flex-wrap items-center gap-3 border-t pt-3">
                    <span className="ct-label">{p.first_name ?? "—"}</span>
                    {p.study_field && <span className="ct-help">{labels.studyFields[p.study_field] ?? p.study_field}</span>}
                    {p.track_prefs.map((k) => (
                      <Badge key={`t-${k}`} tone="accent">{labels.tracks[k] ?? k}</Badge>
                    ))}
                    {p.skills.map((k) => (
                      <Badge key={`s-${k}`} tone="neutral">{skill(k)}</Badge>
                    ))}
                    {modus === "kapitaen" &&
                      (p.invited ? (
                        <Badge tone="warning">{t.requestWaiting}</Badge>
                      ) : (
                        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(invitePerson(p.person_id, ""), t.inviteSent)}>
                          {t.invite}
                        </Button>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Card>
  );
}
