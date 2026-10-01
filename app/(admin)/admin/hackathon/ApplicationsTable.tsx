"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { neuesFenster } from "@/components/ui/neues-fenster";
import { decideApplication } from "./actions";

export type AdminApplication = {
  application_id: string;
  person_id: string;
  first_name: string | null;
  last_name: string | null;
  status: "applied" | "accepted" | "declined" | "withdrawn";
  skills: string[] | null;
  motivation: string | null;
  team_pref: string | null;
  github_url: string | null;
  website_url: string | null;
  behance_url: string | null;
  team_name: string | null;
  /** HACK-010: Track-Wunsch und Profilmerkmale für die Auswahl je Track. */
  track_prefs: string[] | null;
  occupation_status: string | null;
  study_field: string | null;
  study_program_label: string | null;
  university: string | null;
  graduation_year: number | null;
  function_area: string | null;
  profile_skills: string[] | null;
};

/** Bezeichnungen aus `vocab_term`, je Vokabular Schlüssel → Text. */
export type ApplicationLabels = {
  skills: Record<string, string>;
  tracks: Record<string, string>;
  studyFields: Record<string, string>;
  profileSkills: Record<string, string>;
};

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = { applied: "warning", accepted: "success", declined: "neutral", withdrawn: "neutral" };

/**
 * Bewerbungen für den Hackathon entscheiden (ADM-055). Offene zuerst (Reihenfolge aus der RPC).
 *
 * HACK-010: Auswahl je Track — der Filter zeigt nur Bewerbungen, die den Track
 * wünschen (mit Anzahl je Track), und die Spalte „Profil“ blendet Studienfeld,
 * Studiengang, Abschlussjahr und Profil-Skills ein, damit die Auswahl nicht nur
 * nach der Motivation geht.
 */
export function ApplicationsTable({
  rows,
  labels,
  t,
  rpcMessages,
}: {
  rows: AdminApplication[];
  labels: ApplicationLabels;
  t: Strings;
  rpcMessages: Strings;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [track, setTrack] = useState("");

  if (rows.length === 0) return <EmptyState title={t.appsEmpty} description={t.appsEmptyBody} />;

  const skillLabels = labels.skills;
  const anzahl = (k: string) => rows.filter((a) => (a.track_prefs ?? []).includes(k)).length;
  const trackOptions = Object.entries(labels.tracks).map(([value, label]) => ({
    value,
    label: `${label} (${anzahl(value)})`,
  }));
  const gezeigt = track ? rows.filter((a) => (a.track_prefs ?? []).includes(track)) : rows;
  const profil = (a: AdminApplication) =>
    [
      a.study_field ? (labels.studyFields[a.study_field] ?? a.study_field) : null,
      a.study_program_label,
      a.university,
      a.graduation_year ? t.profileGraduation.replace("{jahr}", String(a.graduation_year)) : null,
    ].filter(Boolean).join(" · ");

  const status = (s: string) => t[`status${s[0].toUpperCase()}${s.slice(1)}`] ?? s;
  const entscheiden = (id: string, s: "applied" | "accepted" | "declined") =>
    start(async () => {
      const res = await decideApplication(id, s);
      if (!res.ok) toast("error", rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key);
      else {
        toast("success", t.decided);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-3">
      {trackOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="hack-track-filter" className="ct-label">{t.trackFilter}</label>
          <Select
            id="hack-track-filter"
            className="w-auto"
            value={track}
            placeholder={`${t.trackFilterAll} (${rows.length})`}
            options={trackOptions}
            onChange={(e) => setTrack(e.target.value)}
          />
        </div>
      )}
      {gezeigt.length === 0 ? (
        <p className="ct-help">{t.filterEmpty}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Thead>
              <Tr>
                <Th>{t.colName}</Th>
                <Th>{t.colStatus}</Th>
                <Th>{t.colTracks}</Th>
                <Th>{t.colProfile}</Th>
                <Th>{t.colSkills}</Th>
                <Th>{t.colMotivation}</Th>
                <Th>{t.colPortfolio}</Th>
                <Th>{t.colTeam}</Th>
                <Th>{""}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {gezeigt.map((a) => (
                <Tr key={a.application_id} controls>
                  <Td>{[a.first_name, a.last_name].filter(Boolean).join(" ") || "—"}</Td>
                  <Td>
                    <Badge tone={TONE[a.status] ?? "neutral"}>{status(a.status)}</Badge>
                  </Td>
                  <Td>{(a.track_prefs ?? []).map((k) => labels.tracks[k] ?? k).join(", ") || "—"}</Td>
                  <Td>
                    <span className="ct-small block max-w-xs">{profil(a) || "—"}</span>
                    {(a.profile_skills ?? []).length > 0 && (
                      <span className="ct-help block max-w-xs">
                        {(a.profile_skills ?? []).map((s) => labels.profileSkills[s] ?? s).join(", ")}
                      </span>
                    )}
                  </Td>
                  <Td>{(a.skills ?? []).map((s) => skillLabels[s] ?? s).join(", ") || "—"}</Td>
                  <Td>
                    <span className="ct-small line-clamp-3 max-w-xs whitespace-pre-line">{a.motivation ?? "—"}</span>
                  </Td>
                  <Td>
                    <span className="flex flex-col gap-1 ct-small">
                      {a.github_url && <a href={a.github_url} {...neuesFenster} className="ct-link">GitHub</a>}
                      {a.website_url && <a href={a.website_url} {...neuesFenster} className="ct-link">Website</a>}
                      {a.behance_url && <a href={a.behance_url} {...neuesFenster} className="ct-link">Behance</a>}
                      {!a.github_url && !a.website_url && !a.behance_url && "—"}
                    </span>
                  </Td>
                  <Td>{a.team_name ?? "—"}</Td>
                  <Td>
                    <span className="flex flex-wrap gap-2">
                      {a.status !== "accepted" && (
                        <Button size="sm" variant="secondary" disabled={pending} onClick={() => entscheiden(a.application_id, "accepted")}>
                          {t.accept}
                        </Button>
                      )}
                      {a.status !== "declined" && (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => entscheiden(a.application_id, "declined")}>
                          {t.decline}
                        </Button>
                      )}
                      {a.status !== "applied" && a.status !== "withdrawn" && (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => entscheiden(a.application_id, "applied")}>
                          {t.reset}
                        </Button>
                      )}
                    </span>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
