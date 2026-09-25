-- Company Tour: bis zu fünf Wünsche je Stopp (PART-092, K-41)
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Konrad zu K-41 (25.09.): „Es wäre super cool, wenn jeder Partner 5 Wünsche markieren könnte.
-- Die Auswahl treffen wir.“ Der Partner eines Stopps markiert in der Bewerbungsliste der Tour bis zu
-- fünf Bewerbungen als Wunsch; entschieden wird weiter vom Team für die ganze Tour (PART-046, #224).
--
-- * **Eigene Tabelle** `company_tour_wish` (Stopp × Bewerbung), kein Statuswert der Bewerbung: der Status
--   gehört der Entscheidung des Teams, und eine Bewerbung kann Wunsch mehrerer Stopps sein.
--   RLS ohne Policies und ohne Grants für `anon`/`authenticated` — gelesen und geschrieben wird nur
--   über die Funktionen unten.
-- * **Schreibweg** `partner_set_tour_wish(stop, bewerbung, wunsch)`: Recht wie beim Lesen der Liste
--   (`partner_can_edit` der Organisation des Stopps); nur Bewerbungen der Tour-Session; **nur mit
--   Einwilligung** (`consent_share`) — wen der Partner nicht sehen darf, kann er nicht wünschen;
--   höchstens fünf je Stopp, gezählt unter einer Sperre auf der Stopp-Zeile, damit zwei gleichzeitige
--   Klicks nicht sechs ergeben. Jeder Wunsch und jede Rücknahme im Audit. Gibt die Zahl der Wünsche
--   des Stopps zurück.
-- * **Lesen:** `partner_tour_applications` liefert hinten `wished`; das Team sieht die Wünsche je
--   Bewerbung über `tour_wishes_for_session` (nur Team der Session, `is_application_team`) in seiner
--   Entscheidungssicht unter Admin → Bewerbungen.

set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) Tabelle

create table company_tour_wish (
  stop_id        uuid        not null references company_tour_stop (id) on delete cascade,
  application_id uuid        not null references application (id) on delete cascade,
  created_by     uuid        references person (id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (stop_id, application_id)
);

comment on table company_tour_wish is
  'PART-092: Wünsche des Partners eines Tour-Stopps unter den Bewerbungen der Tour (höchstens fünf je Stopp, nur mit Einwilligung). Keine Entscheidung — die trifft das Team. Nur über partner_set_tour_wish, partner_tour_applications und tour_wishes_for_session.';

alter table company_tour_wish enable row level security;
revoke all on company_tour_wish from anon, authenticated;

-- ---------------------------------------------------------------- 2) Wunsch setzen oder zurücknehmen

create or replace function partner_set_tour_wish(p_stop_id uuid, p_application_id uuid, p_wish boolean)
 returns integer
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
declare v_st company_tour_stop; v_session uuid; v_app application; v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- Die Sperre auf der Stopp-Zeile reiht gleichzeitige Wünsche desselben Stopps hintereinander,
  -- sonst ergäben zwei Klicks auf den fünften Wunsch sechs.
  select * into v_st from company_tour_stop where id = p_stop_id for update;
  if not found then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  if v_st.host_org_id is null or not partner_can_edit(v_st.host_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select ct.session_id into v_session from company_tour ct where ct.id = v_st.tour_id;
  select * into v_app from application a where a.id = p_application_id;
  if not found or v_session is null or v_app.session_id is distinct from v_session then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;

  if coalesce(p_wish, false) then
    -- Wen der Partner nicht sehen darf, kann er auch nicht wünschen.
    if not v_app.consent_share then raise exception 'application_not_shared' using errcode = 'P0001'; end if;
    if not exists (select 1 from company_tour_wish w where w.stop_id = p_stop_id and w.application_id = p_application_id) then
      select count(*)::integer into v_n from company_tour_wish w where w.stop_id = p_stop_id;
      if v_n >= 5 then raise exception 'too_many_wishes' using errcode = 'P0001', detail = '5'; end if;
      insert into company_tour_wish (stop_id, application_id, created_by)
      values (p_stop_id, p_application_id, current_person_id());
    end if;
  else
    delete from company_tour_wish w where w.stop_id = p_stop_id and w.application_id = p_application_id;
  end if;

  select count(*)::integer into v_n from company_tour_wish w where w.stop_id = p_stop_id;
  perform log_audit(case when coalesce(p_wish, false) then 'partner.tour_wish' else 'partner.tour_wish_remove' end,
                    'company_tour_stop', p_stop_id::text, null,
                    jsonb_build_object('org_id', v_st.host_org_id, 'application_id', p_application_id, 'count', v_n));
  return v_n;
end $$;

comment on function partner_set_tour_wish(uuid, uuid, boolean) is
  'PART-092: Wunsch des Partners eines Stopps setzen (true) oder zurücknehmen (false). partner_can_edit, nur Bewerbungen der Tour-Session mit Einwilligung, höchstens fünf je Stopp, Audit. Gibt die Zahl der Wünsche des Stopps zurück.';

grant execute on function partner_set_tour_wish(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- 3) Bewerbungen des Stopps mit Wunsch (Live-Fassung + Spalte)

-- Die Rückgabe bekommt eine Spalte hinten: `create or replace` kann das nicht, also drop + create.
drop function if exists partner_tour_applications(uuid);

create or replace function partner_tour_applications(p_stop_id uuid)
 RETURNS TABLE(id uuid, person_id uuid, display_name text, status text, rank integer, answers jsonb, consent_share boolean, confirm_by timestamp with time zone, confirmed_at timestamp with time zone, decided_at timestamp with time zone, created_at timestamp with time zone, profile jsonb, wished boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_st company_tour_stop; v_session uuid; v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_st from company_tour_stop where company_tour_stop.id = p_stop_id;
  if not found then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  if v_st.host_org_id is null or not partner_can_edit(v_st.host_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select ct.session_id into v_session from company_tour ct where ct.id = v_st.tour_id;
  if v_session is null then return; end if;

  select count(*)::integer into v_n from application a where a.session_id = v_session;
  perform log_audit('application.partner_view', 'session', v_session::text, null,
                    jsonb_build_object('org_id', v_st.host_org_id, 'stop_id', p_stop_id, 'rows', v_n, 'tour', true));

  return query
    select a.id,
           case when a.consent_share then a.person_id end,
           case when a.consent_share
                then nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') end,
           a.status, a.rank,
           case when a.consent_share then (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'key', e.key,
                      'label_de', coalesce(qc.label_de, sq.label_de, e.key),
                      'label_en', coalesce(qc.label_en, sq.label_en, qc.label_de, sq.label_de, e.key),
                      'value', e.value)
                    order by coalesce(sq.sort_order, 999), e.key), '[]'::jsonb)
               from jsonb_each(coalesce(a.answers, '{}'::jsonb)) e
               left join session_question sq
                      on sq.session_id = v_session and coalesce(sq.question_id::text, sq.id::text) = e.key
               left join question_catalog qc on qc.id = sq.question_id) end,
           a.consent_share, a.confirm_by, a.confirmed_at, a.decided_at, a.created_at,
           case when a.consent_share then jsonb_strip_nulls(jsonb_build_object(
             'occupation_status', p.occupation_status, 'career_level', p.career_level,
             'employer_name', p.employer_name, 'university', p.university,
             'study_field', p.study_field, 'city', p.city, 'linkedin_url', p.linkedin_url)) end,
           -- PART-092: vom Partner dieses Stopps gewünscht (höchstens fünf).
           exists (select 1 from company_tour_wish w where w.stop_id = p_stop_id and w.application_id = a.id)
      from application a
      join person p on p.id = a.person_id
     where a.session_id = v_session
     order by case a.status when 'confirmed' then 0 when 'accepted' then 1 when 'promoted' then 1
                            when 'shortlisted' then 2 when 'applied' then 3 when 'waitlisted' then 4 else 5 end,
              a.rank nulls last, a.created_at;
end $$;

grant execute on function partner_tour_applications(uuid) to authenticated;

-- ---------------------------------------------------------------- 4) Wünsche in der Entscheidungssicht des Teams

create or replace function tour_wishes_for_session(p_session_id uuid)
 returns table (application_id uuid, org_name text, tour_name text, stop_sort integer)
 language plpgsql
 stable
 security definer
 set search_path = public, extensions
as $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- Dieselbe Grenze wie die Bewerbungsliste des Teams (`applications_for_session` mit vollen Angaben).
  if not is_application_team(p_session_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select w.application_id, coalesce(o.communication_name, o.legal_name), ct.name, st.sort_order
      from company_tour_wish w
      join company_tour_stop st on st.id = w.stop_id
      join company_tour ct on ct.id = st.tour_id
      left join organization o on o.id = st.host_org_id
     where ct.session_id = p_session_id
     order by st.sort_order, o.legal_name;
end $$;

comment on function tour_wishes_for_session(uuid) is
  'PART-092: Wünsche der Stopp-Partner zu den Bewerbungen einer Tour-Session, für das Team der Session (is_application_team). Leer bei Sessions ohne Tour.';

grant execute on function tour_wishes_for_session(uuid) to authenticated;

select harden_definer_functions();
