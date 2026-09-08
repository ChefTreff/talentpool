import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { getSessionContext } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-[14px] text-muted">{label}</dt>
      <dd className="text-right text-[14px]">{value || "—"}</dd>
    </div>
  );
}

export default async function PersonDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { preferredLanguage } = await getSessionContext();
  const { locale, t } = await getI18n(preferredLanguage);
  const f = t.profile.fields;
  const d = t.admin.personDetail;

  const [
    { data: person },
    { data: emails },
    { data: interests },
    { data: channels },
    { data: regs },
    vocab,
  ] = await Promise.all([
    admin.from("person").select("*").eq("id", id).maybeSingle(),
    admin
      .from("person_email")
      .select("email, type, is_primary, verified")
      .eq("person_id", id),
    admin.from("person_interest").select("vocabulary, term_key").eq("person_id", id),
    admin.from("person_acquisition_channel").select("term_key").eq("person_id", id),
    admin
      .from("registration")
      .select("status, ticket_type, source, registered_at, event(name, format_tag)")
      .eq("person_id", id),
    loadVocabMap(admin, locale),
  ]);

  if (!person) notFound();

  const name =
    [person.first_name, person.last_name].filter(Boolean).join(" ") ||
    t.admin.persons.noName;

  return (
    <div className="max-w-[1000px]">
      <Link href="/admin/personen" className="ct-link text-[14px]">
        ← {d.back}
      </Link>
      <div className="mt-2">
        <PageHeader title={name} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="ct-h2 mb-3 text-ink">{d.masterData}</h2>
          <dl>
            <Row label={f.birthdate} value={person.birthdate} />
            <Row label={f.gender} value={vlabel(vocab, "gender", person.gender)} />
            <Row label={f.nationality} value={person.nationality} />
            <Row label={f.country} value={person.country} />
            <Row label={f.phone} value={person.phone} />
            <Row
              label={f.linkedin}
              value={
                person.linkedin_url ? (
                  <a
                    href={person.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="ct-link"
                  >
                    {d.linkedinProfile}
                  </a>
                ) : null
              }
            />
            <Row label={f.language} value={person.preferred_language} />
          </dl>
        </Card>

        <Card>
          <h2 className="ct-h2 mb-3 text-ink">{d.workStudy}</h2>
          <dl>
            <Row
              label={f.occupationStatus}
              value={vlabel(vocab, "occupation_status", person.occupation_status)}
            />
            <Row
              label={f.workExperience}
              value={vlabel(vocab, "work_experience", person.work_experience)}
            />
            <Row
              label={f.careerLevel}
              value={vlabel(vocab, "career_level", person.career_level)}
            />
            <Row
              label={f.employerType}
              value={vlabel(vocab, "employer_type", person.employer_type)}
            />
            <Row label={f.employerName} value={person.employer_name} />
            <Row
              label={f.startupPhase}
              value={vlabel(vocab, "startup_phase", person.startup_phase)}
            />
            <Row
              label={f.studyField}
              value={vlabel(vocab, "study_field", person.study_field)}
            />
            <Row
              label={f.studyProgram}
              value={vlabel(vocab, "study_program", person.study_program)}
            />
            <Row label={f.university} value={person.university} />
            <Row
              label={f.selfAssessment}
              value={vlabel(vocab, "self_assessment", person.self_assessment)}
            />
          </dl>
        </Card>

        <Card>
          <h2 className="ct-h2 mb-3 text-ink">{d.emails}</h2>
          <ul className="text-[14px]">
            {(emails ?? []).map((e) => (
              <li key={e.email} className="flex flex-wrap items-center gap-2 py-1">
                <span>{e.email}</span>
                {e.is_primary && <Badge tone="accent">{d.primary}</Badge>}
                <span className="text-muted">{e.type}</span>
                {e.verified && <Badge tone="success">{d.verified}</Badge>}
              </li>
            ))}
            {(emails ?? []).length === 0 && (
              <li className="text-muted">{t.common.none}</li>
            )}
          </ul>
        </Card>

        <Card>
          <h2 className="ct-h2 mb-3 text-ink">{d.interests}</h2>
          <div className="flex flex-wrap gap-2">
            {(interests ?? []).map((i) => (
              <Badge key={`${i.vocabulary}:${i.term_key}`}>
                {vlabel(vocab, i.vocabulary, i.term_key)}
              </Badge>
            ))}
            {(interests ?? []).length === 0 && (
              <span className="text-[14px] text-muted">{t.common.none}</span>
            )}
          </div>

          <h2 className="ct-h2 mb-3 mt-6 text-ink">{d.channels}</h2>
          <div className="flex flex-wrap gap-2">
            {(channels ?? []).map((c) => (
              <Badge key={c.term_key}>
                {vlabel(vocab, "acquisition_channel", c.term_key)}
              </Badge>
            ))}
            {(channels ?? []).length === 0 && (
              <span className="text-[14px] text-muted">{t.common.none}</span>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="ct-h2 mb-3 text-ink">{d.registrations}</h2>
        <ul className="text-[14px]">
          {(regs ?? []).map((r, idx) => {
            const evRaw = r.event as unknown;
            const ev = (Array.isArray(evRaw) ? evRaw[0] : evRaw) as
              | { name: string; format_tag: string }
              | undefined;
            return (
              <li key={idx} className="flex flex-wrap gap-2 border-b py-2 last:border-0">
                <span>{ev?.name ?? t.common.none}</span>
                <span className="text-muted">
                  {vlabel(vocab, "registration_status", r.status)}
                </span>
                {r.ticket_type && (
                  <span className="text-muted">
                    · {vlabel(vocab, "ticket_type", r.ticket_type)}
                  </span>
                )}
                {r.source && <span className="text-muted-soft">· {r.source}</span>}
              </li>
            );
          })}
          {(regs ?? []).length === 0 && (
            <li className="text-muted">{d.noRegistrations}</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
