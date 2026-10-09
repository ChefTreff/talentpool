import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ZugaengeListe, type Konto } from "./ZugaengeListe";
import { ZugaengeKopf, type ZugaengeFilter } from "./ZugaengeKopf";
import { Geraetekonto } from "./Geraetekonto";
import { PersonAufnehmen } from "./PersonAufnehmen";
import { TeamEinladung } from "./TeamEinladung";
import { loadVocabMap, vgroup } from "@/lib/vocab";

export const dynamic = "force-dynamic";

const SEITE = 50;
const FILTER: readonly ZugaengeFilter[] = ["team", "alle", "gesperrt", "ohne_login"];

/**
 * Team & Zugänge (ADM-094, vorher zwei Seiten: Team und Zugänge): wer Zugang hat und was er darf — ein Bestand,
 * vier Filter, eine Aktion je Zeile.
 *
 * Grundlage ist `team_access_list` (Abschnitt `access`). Die Filter zählen alle vier Mengen mit; die Liste zeigt
 * die gewählte. **Gesperrt, nicht gelöscht** (PORT4b): wer geht, verliert den Zugang, nicht seine Geschichte; die
 * Sperre ist ein Zeitstempel an der Person, `role_assignment` bleibt unberührt, damit das Öffnen genau
 * wiederherstellt, was vorher galt. Gesperrte stehen sichtbar in der Liste.
 *
 * `/admin/team` leitet hierher um (`?filter=team`); die Rechte der Seite sind ein Abschnitt, `access`.
 */
export default async function ZugaengePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; seite?: string; filter?: string }>;
}) {
  const ctx = await requireAdminSection("access", "/admin/verwaltung/zugaenge");
  const { t, locale } = await getI18n("de");
  const { q, seite: seiteRoh, filter: filterRoh } = await searchParams;
  const suche = (q ?? "").trim();
  const seite = Math.max(1, Number(seiteRoh ?? "1") || 1);
  const filter = (FILTER as readonly string[]).includes(filterRoh ?? "") ? (filterRoh as ZugaengeFilter) : "team";

  const supabase = await createSupabaseServerClient();
  const liste = (f: ZugaengeFilter, limit: number, offset: number) =>
    supabase.rpc("team_access_list", { p_query: suche || null, p_filter: f, p_limit: limit, p_offset: offset });
  // Die Zahl je Filter kommt aus `total` der jeweiligen Abfrage; die gewählte liefert zugleich die Zeilen.
  const andere = FILTER.filter((f) => f !== filter);
  const [{ data }, ...zahlen] = await Promise.all([
    liste(filter, SEITE, (seite - 1) * SEITE),
    ...andere.map((f) => liste(f, 1, 0)),
  ]);
  const konten = (data ?? []) as Konto[];
  const zaehler = { team: 0, alle: 0, gesperrt: 0, ohne_login: 0 } as Record<ZugaengeFilter, number>;
  zaehler[filter] = Number(konten[0]?.total ?? 0);
  andere.forEach((f, i) => {
    zaehler[f] = Number(((zahlen[i].data ?? []) as Konto[])[0]?.total ?? 0);
  });

  // ADM-038: Gerätekonten gibt es nur für Editionen, die noch nicht vorbei sind.
  const heute = new Date().toISOString().slice(0, 10);
  const [{ data: editionen }, { data: laufende }, { data: teamRollen }, vocab] = await Promise.all([
    supabase.from("event").select("id, name").eq("is_edition", true).gte("end_date", heute).order("start_date"),
    supabase.from("event").select("id, name").eq("is_edition", true).order("start_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc("team_role_keys"),
    loadVocabMap(supabase, locale),
  ]);
  const rollenLabel = vgroup(vocab, "role");
  const alleRollen = ((teamRollen ?? []) as string[]).map((value) => ({ value, label: rollenLabel[value] ?? value }));
  // QS-056: Teammitglied einladen vergibt kein `admin` — das ist eine bewusste Entscheidung und läuft über „+ Rolle“.
  const rollen = alleRollen.filter((r) => r.value !== "admin");

  const strings = t.accessAdmin as Record<string, string>;
  const common = { cancel: t.common.cancel, save: t.common.save, required: t.common.required, choose: t.common.choose, none: t.common.none };
  const rpcMessages = t.rpc as Record<string, string>;
  const editionListe = (editionen ?? []) as { id: string; name: string }[];

  // Der Leerzustand trägt genau eine Aktion (Skill-Regel 9): bei einer Suche sie zurücksetzen, sonst alle zeigen. Zweitrangig: die eine
  // Hauptaktion der Seite ist „Teammitglied hinzufügen“ (Regel 1); ein Knopf, kein Textlink — der hat am Finger keine 44 px.
  const leerAktion =
    suche || filter !== "alle" ? (
      <ButtonLink variant="secondary" href={suche ? (filter === "team" ? "/admin/verwaltung/zugaenge" : `/admin/verwaltung/zugaenge?filter=${filter}`) : "/admin/verwaltung/zugaenge?filter=alle"}>
        {suche ? strings.clearSearch : strings.showAll}
      </ButtonLink>
    ) : undefined;

  const basis = (() => {
    const p = new URLSearchParams();
    if (filter !== "team") p.set("filter", filter);
    if (suche) p.set("q", suche);
    return `/admin/verwaltung/zugaenge${p.size ? `?${p}` : ""}`;
  })();

  return (
    <>
      <PageHeader word={t.admin.words.team} title={strings.title} description={strings.lead} />
      <div className="flex flex-col gap-6">
        <ZugaengeKopf
          suche={suche}
          filter={filter}
          zaehler={zaehler}
          t={strings}
          einladung={
            <TeamEinladung editionen={editionListe} rollen={rollen} t={strings} common={common} rpcMessages={rpcMessages} />
          }
          aufnehmen={
            <PersonAufnehmen
              rollen={alleRollen}
              editionId={laufende?.id ?? null}
              editionName={laufende?.name ?? null}
              t={strings}
              common={common}
              rpcMessages={rpcMessages}
            />
          }
          geraet={<Geraetekonto editionen={editionListe} t={strings} common={common} rpcMessages={rpcMessages} />}
        />
        <ZugaengeListe
          konten={konten}
          basisAdresse={basis}
          seite={seite}
          proSeite={SEITE}
          /** Die eigene Kennung: der Eintrag zum Selbstsperren gehört gar nicht erst hin. */
          selbst={ctx.personId}
          rollen={alleRollen}
          rollenLabel={rollenLabel}
          editionId={laufende?.id ?? null}
          editionName={laufende?.name ?? null}
          dateLocale={t.meta.dateLocale}
          t={strings}
          common={common}
          rpcMessages={rpcMessages}
          leerAktion={leerAktion}
        />
      </div>
    </>
  );
}
