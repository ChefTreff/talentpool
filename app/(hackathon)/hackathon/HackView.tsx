"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { applyHackathon, createTeam, joinTeam, leaveTeam, submitProject } from "./actions";
import type { MyHack } from "./types";
import { neuesFenster } from "@/components/ui/neues-fenster";

type Strings = Record<string, string>;

const STATUS_TONE: Record<string, BadgeTone> = {
  applied: "warning",
  accepted: "success",
  declined: "neutral",
  withdrawn: "neutral",
};

/**
 * Der Weg durch den Hackathon von oben nach unten: bewerben → Team →
 * Challenge → Einreichung. Jeder Schritt zeigt nur, was gerade dran ist; die
 * späteren stehen erst da, wenn sie erreichbar sind.
 *
 * Discord bleibt der Kommunikationskanal (Entscheidung E3) — das Portal
 * verwaltet, was verwaltet werden muss, und schickt für alles andere dorthin.
 */
export function HackView({
  data,
  skills,
  discordUrl,
  t,
  common,
  rpcMessages,
}: {
  data: MyHack;
  skills: Record<string, string>;
  discordUrl: string | null;
  t: Strings;
  common: { save: string; cancel: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  function run(action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) {
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        toast("error", message(res.key ?? "unknown") + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", okText);
      router.refresh();
    });
  }

  if (!data.application) {
    return <ApplyCard skills={skills} pending={pending} t={t} run={run} />;
  }

  const accepted = data.application.status === "accepted";
  const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={STATUS_TONE[data.application.status] ?? "neutral"}>
            {t[`status${data.application.status[0].toUpperCase()}${data.application.status.slice(1)}`] ??
              data.application.status}
          </Badge>
          <span className="ct-help">
            {(data.application.skills ?? []).map((s) => skills[s] ?? s).join(" · ")}
          </span>
        </div>
        <p className="ct-help mt-2">
          {t[`status${data.application.status[0].toUpperCase()}${data.application.status.slice(1)}Body`] ?? ""}
        </p>
      </Card>

      {accepted && (
        <Card>
          <CardHeader title={t.teamTitle} description={t.teamLead} />
          {data.team ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-3">
                <h3 className="ct-h3">{data.team.name}</h3>
                <span className="ct-help tabular-nums">
                  {t.members.replace("{n}", String(data.team.members.length))}
                </span>
              </div>
              <ul className="flex flex-wrap gap-2">
                {data.team.members.map((m) => (
                  <li key={m.person_id}>
                    <Badge tone={m.is_captain ? "accent" : "neutral"}>
                      {m.name ?? "—"}
                      {m.is_captain ? ` · ${t.captain}` : ""}
                    </Badge>
                  </li>
                ))}
              </ul>
              <div>
                <p className="ct-label">{t.yourCode}</p>
                <code className="ct-h3 mt-1 inline-block rounded-ct-md border bg-surface-hover px-3 py-1.5 tracking-wider">
                  {data.team.join_code}
                </code>
                <p className="ct-help mt-1">{t.codeHint}</p>
              </div>
              {data.team.members.length < 3 && <p className="ct-help text-warning-ink">{t.tooSmall}</p>}
              <div>
                <Button variant="ghost" disabled={pending} onClick={() => run(leaveTeam(), t.left)}>
                  {t.leave}
                </Button>
              </div>
            </div>
          ) : (
            <TeamForms pending={pending} t={t} run={run} />
          )}
        </Card>
      )}

      {accepted && data.team && (
        <Card>
          <CardHeader title={t.challengeTitle} description={t.challengeLead} />
          {data.challenge ? (
            <div className="flex flex-col gap-3">
              <h3 className="ct-h3">{data.challenge.title}</h3>
              {data.challenge.description && <p className="leading-6">{data.challenge.description}</p>}
              {data.challenge.prizes && (
                <p>
                  <span className="ct-label">{t.prizes}: </span>
                  <span className="text-muted">{data.challenge.prizes}</span>
                </p>
              )}
              {data.challenge.resources && (
                <p>
                  <span className="ct-label">{t.resources}: </span>
                  <span className="text-muted">{data.challenge.resources}</span>
                </p>
              )}
              {(data.challenge.criteria ?? []).length > 0 && (
                <div>
                  <p className="ct-label">{t.judgedBy}</p>
                  <ul className="ml-5 list-disc">
                    {data.challenge.criteria.map((c) => (
                      <li key={c.key} className="text-muted">
                        {c.label} · {c.weight} %
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="ct-help">{t.challengeNone}</p>
          )}
        </Card>
      )}

      {accepted && data.team && data.challenge && (
        <SubmitCard
          submission={data.submission}
          canSubmit={data.team.members.length >= 3}
          pending={pending}
          dateTime={dateTime}
          t={t}
          common={common}
          run={run}
        />
      )}

      {discordUrl && (
        <Card>
          <CardHeader title={t.discord} description={t.discordHint} />
          <a className="ct-link" href={discordUrl} {...neuesFenster}>
            {discordUrl}
          </a>
        </Card>
      )}
    </div>
  );
}

function ApplyCard({
  skills,
  pending,
  t,
  run,
}: {
  skills: Record<string, string>;
  pending: boolean;
  t: Strings;
  run: (a: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [motivation, setMotivation] = useState("");
  const [teamPref, setTeamPref] = useState("");

  return (
    <Card>
      <CardHeader title={t.applyTitle} description={t.applyLead} />
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="ct-label mb-2">{t.skills}</legend>
          <div className="flex flex-wrap gap-3">
            {Object.entries(skills).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={chosen.includes(key)}
                  onChange={() =>
                    setChosen((c) => (c.includes(key) ? c.filter((x) => x !== key) : [...c, key]))
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label={t.motivation} htmlFor="motivation">
          <Textarea id="motivation" rows={4} value={motivation} onChange={(e) => setMotivation(e.target.value)} />
        </Field>

        <Field label={t.teamPref} htmlFor="teampref">
          <Input id="teampref" value={teamPref} onChange={(e) => setTeamPref(e.target.value)} />
        </Field>

        <div>
          <Button
            disabled={pending}
            onClick={() => run(applyHackathon({ skills: chosen, motivation, teamPref }), t.applied)}
          >
            {t.apply}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function TeamForms({
  pending,
  t,
  run,
}: {
  pending: boolean;
  t: Strings;
  run: (a: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  return (
    <div className="flex flex-col gap-5">
      <p className="ct-help">{t.teamNone}</p>
      <div className="flex flex-col gap-2">
        <Field label={t.teamName} htmlFor="teamname">
          <Input id="teamname" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div>
          <Button disabled={pending || name.trim() === ""} onClick={() => run(createTeam(name), t.teamTitle)}>
            {t.createTeam}
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t pt-5">
        <Field label={t.joinCode} htmlFor="joincode" hint={t.joinHint}>
          <Input
            id="joincode"
            className="w-40 uppercase tracking-wider"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </Field>
        <div>
          <Button
            variant="secondary"
            disabled={pending || code.trim().length < 4}
            onClick={() => run(joinTeam(code), t.teamTitle)}
          >
            {t.joinTeam}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SubmitCard({
  submission,
  canSubmit,
  pending,
  dateTime,
  t,
  run,
}: {
  submission: MyHack["submission"];
  canSubmit: boolean;
  pending: boolean;
  dateTime: Intl.DateTimeFormat;
  t: Strings;
  common: { save: string; cancel: string };
  run: (a: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) => void;
}) {
  const [url, setUrl] = useState(submission?.url ?? "");
  const [repoUrl, setRepoUrl] = useState(submission?.repo_url ?? "");
  const [notes, setNotes] = useState(submission?.notes ?? "");

  return (
    <Card>
      <CardHeader title={t.submitTitle} description={t.submitLead} />
      <div className="flex flex-col gap-4">
        {submission?.submitted_at && (
          <p className="ct-help">
            {t.submittedAt.replace("{time}", dateTime.format(new Date(submission.submitted_at)))} · {t.resubmitHint}
          </p>
        )}
        <Field label={t.projectUrl} htmlFor="url">
          <Input id="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <Field label={t.repoUrl} htmlFor="repo">
          <Input id="repo" type="url" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
        </Field>
        <Field label={t.submissionNotes} htmlFor="notes">
          <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {!canSubmit && <p className="ct-help text-warning-ink">{t.tooSmall}</p>}
        <div>
          <Button
            disabled={pending || !canSubmit || url.trim() === ""}
            onClick={() => run(submitProject({ url, repoUrl, notes }), t.submitted)}
          >
            {t.submit}
          </Button>
        </div>
      </div>
    </Card>
  );
}
