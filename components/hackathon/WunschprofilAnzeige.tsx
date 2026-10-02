import { Badge } from "@/components/ui/Badge";
import { hatWunschprofil, type Wunschprofil } from "@/lib/hackathon/wunschprofil";

/** Wunschprofil einer Challenge lesen (HACK-015) — Teilnehmer-App und Admin. */
export function WunschprofilAnzeige({
  profil,
  studyFields,
  skills,
  title,
}: {
  profil: Wunschprofil;
  studyFields: Record<string, string>;
  skills: Record<string, string>;
  title: string;
}) {
  if (!hatWunschprofil(profil)) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="ct-label">{title}</p>
      {profil.profile && <p className="ct-small whitespace-pre-line text-muted">{profil.profile}</p>}
      {(profil.study_fields.length > 0 || profil.skills.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {profil.study_fields.map((k) => (
            <Badge key={`f-${k}`} tone="neutral">{studyFields[k] ?? k}</Badge>
          ))}
          {profil.skills.map((k) => (
            <Badge key={`s-${k}`} tone="neutral">{skills[k] ?? k}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}
