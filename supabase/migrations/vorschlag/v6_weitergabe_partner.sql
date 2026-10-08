-- 0000 · Weitergabe an Partner: Pflichthaken bei Formaten mit Partner-Auswahl, Nachweis, Nachholen (PART-129, K-78)
-- Anlass: Befund docs/befund-part129-qs070-2026-10-08.md — `application.consent_share` ist standardmäßig aus (21 von 68
-- Bewerbungen ohne Haken); Konrad K-78: **Weg B** für alle Formate, in denen Partner auswählen (Company Tour,
-- Masterclass, Side-Event, Interview Table); Text nach docs/entwurf-k72-weitergabe-partner.md (Fassung B, mit
-- E-Mail-Adresse und einmaliger Kontaktaufnahme zu diesem Format).
--   1 `session_needs_partner_share(session)`: wahr bei access_mode application und Format company_tour, masterclass,
--     side_event oder interview_table (host_org_id taugt nicht: bei Company Tours stehen die Gastgeber an den Stopps).
--   2 `apply_to_session` (Live-Fassung aus dem Snapshot; alte Signatur gedroppt, zwei Parameter mit Standard mehr):
--     ohne Haken bei einem solchen Format P0001 `consent_share_required`; mit Haken ein Nachweis in `consent_record`
--     (Typ share_with_partner, Version `partner_share_2027-1`, meta mit application_id, session_id, Sprache, Formular).
--   3 `release_application_share(application, version, language)`: Nachholen für die eigene Bewerbung (Bestand ohne
--     Haken), Nachweis und Audit ohne Adresse; `revoke_application_share(application)`: Widerruf, Nachweis
--     granted = false, Audit. Der Partner sieht eine Bewerbung nur bei gesetztem Flag (unverändert).
-- Fehlerschlüssel neu: consent_share_required (lib/rpc-error.ts + Wörterbücher). application_not_found ist vorhanden.
-- Test: supabase/tests/v6_weitergabe_partner.sql
set search_path = public, extensions;

create or replace function session_needs_partner_share(p_session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce((select s.access_mode = 'application' and s.format in ('company_tour', 'masterclass', 'side_event', 'interview_table')
                     from session s where s.id = p_session_id), false)
$$;

drop function if exists apply_to_session(uuid, jsonb, boolean);

-- Live-Fassung aus supabase/snapshot/functions/apply_to_session.sql; neu: Pflicht und Nachweis der Weitergabe.
create or replace function apply_to_session(p_session_id uuid, p_answers jsonb DEFAULT '{}'::jsonb, p_consent_share boolean DEFAULT false,
                                            p_consent_version text DEFAULT 'partner_share_2027-1', p_language text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_pid  uuid := current_person_id();
  v_s    session%rowtype;
  v_p    person%rowtype;
  v_rule jsonb;
  v_id   uuid;
  v_version text := coalesce(nullif(btrim(p_consent_version), ''), 'partner_share_2027-1');
begin
  if v_pid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_s from session where id = p_session_id;
  if not found or v_s.publish_status <> 'published' then
    raise exception 'session_not_open' using errcode = 'P0002';
  end if;
  if v_s.access_mode <> 'application' then
    raise exception 'session_not_application' using errcode = '22023';
  end if;
  if v_s.application_deadline is not null and v_s.application_deadline < now() then
    raise exception 'deadline_passed' using errcode = 'P0001';
  end if;
  select * into v_p from person where id = v_pid;
  v_rule := coalesce(v_s.eligibility_rule, '{}'::jsonb);
  if coalesce((v_rule->>'u35')::boolean, false) and coalesce(is_u35(v_p.birthdate), false) is not true then
    raise exception 'not_eligible' using errcode = 'P0001', detail = 'u35';
  end if;
  if v_rule ? 'occupation_status'
     and not (v_rule->'occupation_status') ? coalesce(v_p.occupation_status, '') then
    raise exception 'not_eligible' using errcode = 'P0001', detail = 'occupation_status';
  end if;
  if exists (
    select 1 from session_question sq
    where sq.session_id = p_session_id and sq.required
      and not (p_answers ? coalesce(sq.question_id::text, sq.id::text))
  ) then
    raise exception 'missing_required_answers' using errcode = 'P0001';
  end if;
  -- PART-129 (K-78, Weg B): wo der Partner auswählt, ist die Weitergabe Voraussetzung der Bewerbung.
  if session_needs_partner_share(p_session_id) and not coalesce(p_consent_share, false) then
    raise exception 'consent_share_required' using errcode = 'P0001';
  end if;
  if coalesce(p_consent_share, false) and v_version !~ '^partner_share_[0-9]{4}-[0-9]+$' then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'consent_version';
  end if;
  insert into application (session_id, person_id, answers, consent_share)
    values (p_session_id, v_pid, coalesce(p_answers, '{}'::jsonb), p_consent_share)
  on conflict (session_id, person_id) do update
    set status = 'applied', answers = excluded.answers, consent_share = excluded.consent_share,
        decided_by = null, decided_at = null, confirm_by = null, confirmed_at = null, rank = null
    where application.status in ('withdrawn','expired')
  returning id into v_id;
  if v_id is null then
    raise exception 'already_applied' using errcode = '23505';
  end if;
  if coalesce(p_consent_share, false) then
    insert into consent_record (person_id, consent_type, version, granted, source, meta)
    values (v_pid, 'share_with_partner', v_version, true, 'portal',
            jsonb_build_object('application_id', v_id, 'session_id', p_session_id, 'language', p_language, 'form', 'application'));
  end if;
  return v_id;
end $$;

create or replace function release_application_share(p_application_id uuid, p_version text default 'partner_share_2027-1', p_language text default null)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_a application; v_version text := coalesce(nullif(btrim(p_version), ''), 'partner_share_2027-1');
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if v_version !~ '^partner_share_[0-9]{4}-[0-9]+$' then raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'consent_version'; end if;
  select * into v_a from application a where a.id = p_application_id and a.person_id = v_pid for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  if v_a.status in ('withdrawn', 'expired') then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  if v_a.consent_share then return; end if;
  update application set consent_share = true where id = v_a.id;
  insert into consent_record (person_id, consent_type, version, granted, source, meta)
  values (v_pid, 'share_with_partner', v_version, true, 'portal',
          jsonb_build_object('application_id', v_a.id, 'session_id', v_a.session_id, 'language', p_language, 'form', 'release'));
  perform log_audit('application.share_release', 'application', v_a.id::text, null, jsonb_build_object('session_id', v_a.session_id));
end $$;

create or replace function revoke_application_share(p_application_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_a application; v_version text;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_a from application a where a.id = p_application_id and a.person_id = v_pid for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  if not v_a.consent_share then return; end if;
  update application set consent_share = false where id = v_a.id;
  -- Die Version, auf die sich die Einwilligung bezog (letzter Nachweis dieser Bewerbung).
  select r.version into v_version from consent_record r
   where r.person_id = v_pid and r.consent_type = 'share_with_partner' and r.granted and r.meta->>'application_id' = v_a.id::text
   order by r.granted_at desc limit 1;
  insert into consent_record (person_id, consent_type, version, granted, source, meta)
  values (v_pid, 'share_with_partner', coalesce(v_version, 'partner_share_2027-1'), false, 'portal',
          jsonb_build_object('application_id', v_a.id, 'session_id', v_a.session_id, 'form', 'revoke'));
  perform log_audit('application.share_revoke', 'application', v_a.id::text, null, jsonb_build_object('session_id', v_a.session_id));
end $$;

select harden_definer_functions();
