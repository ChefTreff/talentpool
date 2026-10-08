"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button, ButtonDownload } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { applyHackathon, createTeam, joinTeam, leaveTeam, submitProject } from "./actions";
import type { MyHack } from "./types";
import { MetricForm } from "./MetricForm";
import { AbgabeDateien, type AbgabeDatei } from "@/components/hackathon/AbgabeDateien";
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
  challenges = [],
  metric,
  dataset,
  abgabe,
  teamsuche,
  skills,
  tracks,
  discordUrl,
  t,
  common,
  rpcMessages,
}: {
  data: MyHack;
  /** Freigegebene Challenges für die Wunsch-Auswahl in der Bewerbung (HACK-017). */
  challenges?: { id: string; title: string }[];
  /** HACK-009: nur bei einer Metrik-Challenge des eigenen Teams. */
  metric: { label: string; value: number | null; confirmed: boolean } | null;
  /** HACK-012: Datensatz der eigenen Challenge, signiert für 10 Minuten. */
  dataset: { filename: string; size_bytes: number | null; url: string | null } | null;
  /** HACK-011: Dateien der eigenen Abgabe. */
  abgabe: AbgabeDatei[];
  /** HACK-016: Teamsuche, auf dem Server zusammengestellt. */
  teamsuche: React.ReactNode;
  skills: Record<string, string>;
  /** vocab hack_track (HACK-008/010): Schlüssel → Bezeichnung. */
  tracks: Record<string, string>;
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
    return <ApplyCard skills={skills} tracks={tracks} challenges={challenges} pending={pending} t={t} run={run} />;
  }

  const accepted = data.application.status === "accepted";
  const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-6">
      <Card id="application">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={STATUS_TONE[data.application.status] ?? "neutral"}>
            {t[`status${data.application.status[0].toUpperCase()}${data.application.status.slice(1)}`] ??
              data.application.status}
          </Badge>
          <span className="ct-help">
            {(data.application.skills ?? []).map((s) => skills[s] ?? s).join(" · ")}
          </span>
        </div>
        {/* Track-Wunsch (HACK-010). */}
        {(data.application.track_prefs ?? []).length > 0 && (
          <p className="ct-small mt-2">
            <span className="ct-label">{t.trackPrefs}: </span>
            <span className="text-muted">
              {(data.application.track_prefs ?? []).map((k) => tracks[k] ?? k).join(" · ")}
            </span>
          </p>
        )}
        <p className="ct-help mt-2">
          {t[`status${data.application.status[0].toUpperCase()}${data.application.status.slice(1)}Body`] ?? ""}
        </p>
        {/* Portfolio-Links aus der Bewerbung (HACK-007). */}
        {(data.application.github_url || data.application.website_url || data.application.behance_url) && (
          <p className="ct-small mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {data.application.github_url && (
              <a href={data.application.github_url} {...neuesFenster} className="ct-link">{t.githubUrl}</a>
            )}
            {data.application.website_url && (
              <a href={data.application.website_url} {...neuesFenster} className="ct-link">{t.websiteUrl}</a>
            )}
            {data.application.behance_url && (
              <a href={data.application.behance_url} {...neuesFenster} className="ct-link">{t.behanceUrl}</a>
            )}
          </p>
        )}
      </Card>

      {accepted && (
        <Card id="team">
          <CardHeader ebene="h2" title={t.teamTitle} description={t.teamLead} />
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

      {accepted && teamsuche}

      {accepted && data.team && (
        <Card id="challenge">
          <CardHeader ebene="h2" title={t.challengeTitle} description={t.challengeLead} />
          {data.challenge ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="ct-h3">{data.challenge.title}</h3>
                {data.challenge.track && <Badge tone="accent">{tracks[data.challenge.track] ?? data.challenge.track}</Badge>}
              </div>
              {data.challenge.description && <p className="leading-6">{data.challenge.description}</p>}
              {data.challenge.prizes && (
                <p>
                  <span className="ct-label">{t.prizes}: </span>
                  <span className="text-muted">{data.challenge.prizes}</span>
                </p>
              )}
              {dataset?.url && (
                <p className="flex flex-wrap items-center gap-3">
                  <span className="ct-label">{t.dataset}: </span>
                  <span className="text-muted">{dataset.filename}</span>
                  <ButtonDownload href={dataset.url} size="sm" variant="secondary">
                    {t.datasetDownload}
                  </ButtonDownload>
                </p>
              )}
              {data.challenge.resources && (
                <p>
                  <span className="ct-label">{t.resources}: </span>
                  <span className="text-muted">{data.challenge.resources}</span>
                </p>
              )}
              {/* Metrik-Challenge (HACK-009): kein Pitch nach Kriterien, sondern ein Wert. */}
              {metric && data.team && accepted && (
                <div className="flex flex-col gap-2">
                  <p className="ct-label">{t.judgingMetric.replace("{metric}", metric.label)}</p>
                  <p className="ct-help">{t.metricTeamHint}</p>
                  <MetricForm
                    teamId={data.team.id}
                    metricLabel={metric.label}
                    value={metric.value}
                    confirmed={metric.confirmed}
                    t={t}
                    rpcMessages={rpcMessages}
                  />
                </div>
              )}
              {!metric && (data.challenge.criteria ?? []).length > 0 && (
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
          teamId={data.team.id}
          deadline={data.challenge.submission_deadline ?? null}
          abgabe={abgabe}
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
          <CardHeader ebene="h2" title={t.discord} description={t.discordHint} />
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
  tracks,
  challenges,
  pending,
  t,
  run,
}: {
  skills: Record<string, string>;
  tracks: Record<string, string>;
  challenges: { id: string; title: string }[];
  pending: boolean;
  t: Strings;
  run: (a: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [trackPrefs, setTrackPrefs] = useState<string[]>([]);
  // Wunsch-Challenges (HACK-017): drei Plätze in Reihenfolge, jede Challenge nur einmal.
  const [wuensche, setWuensche] = useState<string[]>(["", "", ""]);
  const [motivation, setMotivation] = useState("");
  const [teamPref, setTeamPref] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [behanceUrl, setBehanceUrl] = useState("");

  return (
    <Card id="apply">
      <CardHeader ebene="h2" title={t.applyTitle} description={t.applyLead} />
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

        {/* Track-Wunsch (HACK-010): Pflicht, sobald es Tracks gibt; die Auswahl je
            Track geschieht im Admin. */}
        {Object.keys(tracks).length > 0 && (
          <fieldset>
            <legend className="ct-label mb-1">{t.trackPrefs}</legend>
            <p className="ct-help mb-2">{t.trackPrefsHint}</p>
            <div className="flex flex-wrap gap-3">
              {Object.entries(tracks).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={trackPrefs.includes(key)}
                    onChange={() =>
                      setTrackPrefs((c) => (c.includes(key) ? c.filter((x) => x !== key) : [...c, key]))
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {challenges.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="ct-label mb-1">{t.challengePrefs}</legend>
            <p className="ct-help">{t.challengePrefsHint}</p>
            {wuensche.map((wert, i) => (
              <Field key={i} label={t[`challengePref${i + 1}`]} htmlFor={`wunsch-${i}`}>
                <Select
                  id={`wunsch-${i}`}
                  value={wert}
                  placeholder={t.challengePrefNone}
                  options={challenges
                    .filter((c) => c.id === wert || !wuensche.includes(c.id))
                    .map((c) => ({ value: c.id, label: c.title }))}
                  onChange={(e) => setWuensche((w) => w.map((x, j) => (j === i ? e.target.value : x)))}
                />
              </Field>
            ))}
          </fieldset>
        )}

        <Field label={t.motivation} htmlFor="motivation">
          <Textarea id="motivation" rows={4} value={motivation} onChange={(e) => setMotivation(e.target.value)} />
        </Field>

        <Field label={t.teamPref} htmlFor="teampref">
          <Input id="teampref" value={teamPref} onChange={(e) => setTeamPref(e.target.value)} />
        </Field>

        {/* Portfolio-Links (HACK-007): nur in der Hackathon-Bewerbung, nicht im Profil. */}
        <fieldset className="flex flex-col gap-3">
          <legend className="ct-label mb-1">{t.portfolio}</legend>
          <p className="ct-help">{t.portfolioHint}</p>
          <Field label={t.githubUrl} htmlFor="github">
            <Input id="github" type="url" inputMode="url" placeholder="https://github.com/…" value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)} />
          </Field>
          <Field label={t.websiteUrl} htmlFor="website">
            <Input id="website" type="url" inputMode="url" placeholder="https://…" value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)} />
          </Field>
          <Field label={t.behanceUrl} htmlFor="behance">
            <Input id="behance" type="url" inputMode="url" placeholder="https://www.behance.net/…" value={behanceUrl}
              onChange={(e) => setBehanceUrl(e.target.value)} />
          </Field>
        </fieldset>

        <div>
          <Button
            disabled={pending}
            onClick={() => run(applyHackathon({ skills: chosen, trackPrefs, challengePrefs: wuensche.filter(Boolean), motivation, teamPref, githubUrl, websiteUrl, behanceUrl }), t.applied)}
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
  teamId,
  deadline,
  abgabe,
  submission,
  canSubmit,
  pending,
  dateTime,
  t,
  run,
}: {
  teamId: string;
  deadline: string | null;
  abgabe: AbgabeDatei[];
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
    <Card id="submit">
      <CardHeader ebene="h2" title={t.submitTitle} description={t.submitLead} />
      <div className="flex flex-col gap-4">
        {/* Frist je Challenge (HACK-011): danach geht es weiter, aber „verspätet“. */}
        {deadline && (
          <p className="ct-small">
            <span className="ct-label">{t.deadline}: </span>
            {dateTime.format(new Date(deadline))}
            {new Date(deadline) < new Date() && <span className="ct-help"> · {t.deadlinePassedHint}</span>}
          </p>
        )}
        {submission?.submitted_at && (
          <p className="ct-help flex flex-wrap items-center gap-2">
            {t.submittedAt.replace("{time}", dateTime.format(new Date(submission.submitted_at)))} · {t.resubmitHint}
            {submission.late && <Badge tone="warning">{t.late}</Badge>}
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
        <fieldset className="flex flex-col gap-2">
          <legend className="ct-label mb-1">{t.files}</legend>
          <AbgabeDateien teamId={teamId} dateien={abgabe} editierbar dateLocale={dateTime.resolvedOptions().locale} t={t} />
        </fieldset>
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
