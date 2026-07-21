import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadVocabMap, vlabel } from "@/lib/vocab";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-black/5 py-2 dark:border-white/5">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-right text-sm">{value || "—"}</dd>
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

  const [{ data: person }, { data: emails }, { data: interests }, { data: channels }, { data: regs }, vocab] =
    await Promise.all([
      admin.from("person").select("*").eq("id", id).maybeSingle(),
      admin.from("person_email").select("email, type, is_primary, verified").eq("person_id", id),
      admin.from("person_interest").select("vocabulary, term_key").eq("person_id", id),
      admin.from("person_acquisition_channel").select("term_key").eq("person_id", id),
      admin
        .from("registration")
        .select("status, ticket_type, source, registered_at, event(name, format_tag)")
        .eq("person_id", id),
      loadVocabMap(admin),
    ]);

  if (!person) notFound();

  const name = [person.first_name, person.last_name].filter(Boolean).join(" ") || "(ohne Namen)";

  return (
    <div className="max-w-3xl">
      <Link href="/admin/personen" className="text-sm text-zinc-500 hover:text-foreground">
        ← Personen
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{name}</h1>

      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Stammdaten
          </h2>
          <dl>
            <Row label="Geburtsdatum" value={person.birthdate} />
            <Row label="Geschlecht" value={vlabel(vocab, "gender", person.gender)} />
            <Row label="Nationalität" value={person.nationality} />
            <Row label="Land" value={person.country} />
            <Row label="Telefon" value={person.phone} />
            <Row
              label="LinkedIn"
              value={
                person.linkedin_url ? (
                  <a href={person.linkedin_url} target="_blank" rel="noreferrer" className="underline">
                    Profil
                  </a>
                ) : null
              }
            />
            <Row label="Sprache" value={person.preferred_language} />
          </dl>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Beruf & Studium
          </h2>
          <dl>
            <Row label="Status" value={vlabel(vocab, "occupation_status", person.occupation_status)} />
            <Row label="Berufserfahrung" value={vlabel(vocab, "work_experience", person.work_experience)} />
            <Row label="Karrierelevel" value={vlabel(vocab, "career_level", person.career_level)} />
            <Row label="Arbeitgeber-Art" value={vlabel(vocab, "employer_type", person.employer_type)} />
            <Row label="Arbeitgeber" value={person.employer_name} />
            <Row label="Startup-Phase" value={vlabel(vocab, "startup_phase", person.startup_phase)} />
            <Row label="Studienfeld" value={vlabel(vocab, "study_field", person.study_field)} />
            <Row label="Studiengang" value={vlabel(vocab, "study_program", person.study_program)} />
            <Row label="Universität" value={person.university} />
            <Row label="Selbsteinschätzung" value={vlabel(vocab, "self_assessment", person.self_assessment)} />
          </dl>
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          E-Mails
        </h2>
        <ul className="text-sm">
          {(emails ?? []).map((e) => (
            <li key={e.email} className="flex items-center gap-2 py-1">
              <span>{e.email}</span>
              {e.is_primary && (
                <span className="rounded-full bg-foreground px-2 py-0.5 text-xs text-background">
                  primär
                </span>
              )}
              <span className="text-xs text-zinc-500">{e.type}</span>
              {e.verified && <span className="text-xs text-green-600">verifiziert</span>}
            </li>
          ))}
          {(emails ?? []).length === 0 && <li className="text-zinc-500">—</li>}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Interessen
        </h2>
        <div className="flex flex-wrap gap-2">
          {(interests ?? []).map((i) => (
            <span
              key={`${i.vocabulary}:${i.term_key}`}
              className="rounded-full border border-black/15 px-3 py-1 text-sm dark:border-white/20"
            >
              {vlabel(vocab, i.vocabulary, i.term_key)}
            </span>
          ))}
          {(interests ?? []).length === 0 && <span className="text-sm text-zinc-500">—</span>}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Akquise-Kanäle
        </h2>
        <div className="flex flex-wrap gap-2">
          {(channels ?? []).map((c) => (
            <span
              key={c.term_key}
              className="rounded-full border border-black/15 px-3 py-1 text-sm dark:border-white/20"
            >
              {vlabel(vocab, "acquisition_channel", c.term_key)}
            </span>
          ))}
          {(channels ?? []).length === 0 && <span className="text-sm text-zinc-500">—</span>}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Registrierungen
        </h2>
        <ul className="text-sm">
          {(regs ?? []).map((r, idx) => {
            const evRaw = r.event as unknown;
            const ev = (Array.isArray(evRaw) ? evRaw[0] : evRaw) as
              | { name: string; format_tag: string }
              | undefined;
            return (
              <li key={idx} className="flex flex-wrap gap-2 border-b border-black/5 py-2 dark:border-white/5">
                <span className="font-medium">{ev?.name ?? "—"}</span>
                <span className="text-zinc-500">{vlabel(vocab, "registration_status", r.status)}</span>
                {r.ticket_type && (
                  <span className="text-zinc-500">· {vlabel(vocab, "ticket_type", r.ticket_type)}</span>
                )}
                {r.source && <span className="text-zinc-400">· {r.source}</span>}
              </li>
            );
          })}
          {(regs ?? []).length === 0 && <li className="text-zinc-500">Keine Registrierungen.</li>}
        </ul>
      </section>
    </div>
  );
}
