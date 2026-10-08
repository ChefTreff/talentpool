-- 0273 · Neue Speaker von Partnern: Liste, Marke und Menü-Zähler (ADM-084)
-- Angewendet von der Architektur-Session am 08.10.2026 als 20261008085130.
-- NNNN · Neue Speaker von Partnern: Liste, Marke und Menü-Zähler (ADM-084, Konrad & Leopold 05.10.2026)
--
-- Anlass: Legt ein Partner für seinen Talk oder seine gebrandete Bühne einen Speaker an (`partner_add_speaker`), entsteht ein
-- Profil im Stand `lead`, mit der Leitung der Bühne als Betreuung, sonst ohne. Das Speaker-Team bekommt davon nichts mit: die
-- Herkunft steht in `speaker_profile.created_by_org_id`, aber keine Funktion für das Team gibt sie heraus (`manager_speakers`
-- kennt nur `stage_guest`). Das Team soll diese Speaker in einer Liste „Neue Speaker“ sehen, mit einer Marke in der
-- Speaker-Liste und einem Zähler am Menüpunkt „Speaker“ (wie bei den Freigaben), um Betreuung, Buddy und Pipeline-Stand zu
-- setzen — mit den Funktionen, die es dafür schon gibt (`handover_speaker`, `set_speaker_contacts`, `set_speaker_pipeline`).
--
-- Zwei neue Lesefunktionen, **keine** Tabellen- oder Spaltenänderung und **keine** Änderung an `manager_speakers` (eine
-- Funktion mit vielen Aufrufern — Lead-Portal, Admin-Liste, Side-Events-Seite — würde mit neuen Spalten per drop/create ersetzt):
--
--   partner_created_speakers(p_edition_id uuid default null)
--     Alle von einem Partner angelegten Speaker der Edition (Standard: die jüngste), mit der Kennzahl `is_new`.
--     Zeilen: profile_id, person_id, first_name, last_name, job_title, organization_name (Firma des Speakers), partner_org_id,
--     partner_name, pipeline_status, owner_person_id, owner_name, lead_contact_id, buddy_contact_id, buddy_name,
--     sessions ([{title_de, title_en, stage_name, start_at}]), created_at, is_new.
--     **Keine** E-Mail, kein Telefon, keine Notizen — Name, Partner, Programmpunkt und Zuteilung genügen für die Liste.
--
--   new_speaker_count(p_edition_id uuid default null) → integer
--     Zahl der Zeilen mit `is_new`, für den Menüpunkt. Die Zählung ruft `partner_created_speakers` auf: ein Tor und eine
--     Definition von „neu“, damit Menü und Liste nicht auseinanderlaufen können.
--
-- Definition „neu“ (`is_new`): von einem Partner angelegt (`created_by_org_id` gesetzt) **und** kein Gast der Standbühne
-- (SPK-070: Gäste pflegt der Partner, sie brauchen keinen Speaker-Lead) **und** nicht abgesagt **und** Person nicht gelöscht
-- **und** (Betreuung fehlt **oder** der Pipeline-Stand ist noch `lead`). Der Buddy gehört nicht dazu: `buddy_contact_id = null`
-- heißt „Standard der Edition“ und ist ein gültiger Zustand. Eine Zeile verlässt „neu“, sobald die Betreuung gesetzt **und**
-- der Stand über `lead` hinaus ist; sie bleibt in `partner_created_speakers` (mit `is_new = false`), damit die Speaker-Liste
-- die Marke „von <Partner>“ weiter zeigen kann. Abgesagte, gelöschte und Gast-Profile stehen gar nicht in der Funktion.
--
-- Rechte: **Tor und Zeilenfilter wie `manager_speakers`** (Plan 08.10.): admin, area_lead_speaker, programme_team oder
-- speaker_manager, sonst 42501 — und je Zeile `can_manage_speaker(<Profil>)`. Das Speaker-Team sieht damit alle Zeilen, ein
-- Stage Lead (speaker_manager) nur die Speaker seiner Bühne und die, die er betreut. Speaker, Partner, Talent, Produktion und
-- ohne Anmeldung bekommen 42501. Die Oberfläche (`/admin/speaker`) steht ohnehin nur dem Team offen; das Tor der Funktion ist
-- die Absicherung dahinter, nicht eine Abschrift der Seite. Der Zähler zählt, was die Liste dem Aufrufer zeigt.
--
-- Beide Funktionen sind SECURITY DEFINER (die Tabellen haben keine Grants für `authenticated`; `partner_add_speaker` und die
-- Listen des Teams arbeiten ebenso), `search_path` gepinnt, STABLE, `anon` bekommt kein EXECUTE; am Ende
-- `harden_definer_functions()`.
--
-- Hängt von keiner anderen Migration ab (nur Tabellen und Funktionen, die live sind); unabhängig von `v6_side_events`.
set search_path = public, extensions;

create or replace function partner_created_speakers(p_edition_id uuid default null)
 returns table (
   profile_id uuid, person_id uuid, first_name text, last_name text, job_title text, organization_name text,
   partner_org_id uuid, partner_name text,
   pipeline_status text, owner_person_id uuid, owner_name text,
   lead_contact_id uuid, buddy_contact_id uuid, buddy_name text,
   sessions jsonb, created_at timestamptz, is_new boolean)
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'extensions'
as $$
declare v_ed uuid;
begin
  if not (has_role('speaker_manager') or has_role('admin') or has_role('area_lead_speaker') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  return query
    select sp.id, sp.person_id, p.first_name, p.last_name, sp.job_title, sp.organization_name,
           sp.created_by_org_id, coalesce(o.communication_name, o.legal_name),
           sp.pipeline_status, sp.owner_person_id,
           (select nullif(btrim(coalesce(ow.first_name, '') || ' ' || coalesce(ow.last_name, '')), '')
              from person ow where ow.id = sp.owner_person_id),
           sp.lead_contact_id, sp.buddy_contact_id,
           (select bc.display_name from edition_contact bc where bc.id = sp.buddy_contact_id),
           -- Programmpunkte der Edition, an denen die Person spricht (wie `manager_speakers`): Titel, Bühne, Beginn.
           coalesce((select jsonb_agg(jsonb_build_object('title_de', se.title_de, 'title_en', se.title_en,
                                                          'stage_name', st.name, 'start_at', sl.start_at)
                                       order by sl.start_at nulls last, se.title_de)
                       from session_speaker ss
                       join session se on se.id = ss.session_id
                       join event ev on ev.id = se.event_id
                       left join slot sl on sl.id = se.slot_id
                       left join stage st on st.id = sl.stage_id
                      where ss.person_id = sp.person_id
                        and (ev.edition_id = sp.edition_id or ev.id = sp.edition_id)), '[]'::jsonb),
           sp.created_at,
           (sp.owner_person_id is null or sp.pipeline_status = 'lead')
      from speaker_profile sp
      join person p on p.id = sp.person_id
      join organization o on o.id = sp.created_by_org_id
     where sp.edition_id = v_ed
       and sp.created_by_org_id is not null
       and not sp.stage_guest
       and sp.declined_at is null
       and sp.pipeline_status <> 'declined'
       and p.deleted_at is null
       and can_manage_speaker(sp.id)
     order by (sp.owner_person_id is null or sp.pipeline_status = 'lead') desc,
              sp.created_at desc, p.last_name nulls last, p.first_name nulls last;
end $$;

comment on function partner_created_speakers(uuid) is
  'Von Partnern angelegte Speaker der Edition (ADM-084): created_by_org_id gesetzt, kein Gast der Standbühne, nicht abgesagt, Person nicht gelöscht. is_new = Betreuung fehlt ODER Pipeline-Stand ist noch lead (der Buddy zählt nicht: null = Standard der Edition); eine Zeile verlässt „neu“, wenn Betreuung gesetzt UND Stand über lead hinaus, und bleibt in der Funktion (Marke „von Partner“). Tor und Zeilenfilter wie manager_speakers (can_manage_speaker); ohne E-Mail, Telefon, Notizen.';

create or replace function new_speaker_count(p_edition_id uuid default null)
 returns integer
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'extensions'
as $$
begin
  -- Tor und Definition von „neu“ kommen aus der Listenfunktion; verweigert sie dem Aufrufer die Liste, gilt 42501 auch hier.
  return (select count(*)::integer from partner_created_speakers(p_edition_id) s where s.is_new);
end $$;

comment on function new_speaker_count(uuid) is
  'Zahl der neuen Speaker von Partnern (ADM-084): Zeilen mit is_new aus partner_created_speakers = von einem Partner angelegt, kein Gast, nicht abgesagt, Person nicht gelöscht und (Betreuung fehlt ODER Stand noch lead). Zählt, was die Liste dem Aufrufer zeigt; Tor wie manager_speakers.';

revoke execute on function partner_created_speakers(uuid) from public, anon;
grant execute on function partner_created_speakers(uuid) to authenticated;
revoke execute on function new_speaker_count(uuid) from public, anon;
grant execute on function new_speaker_count(uuid) to authenticated;

select harden_definer_functions();
