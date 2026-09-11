-- 0056 · Zwei Nachträge aus dem Review zu PR #16 (B5+B6):
-- 1) Vorlagenpflege synchronisiert selbst: upsert_deliverable_template stößt resync_deliverables für alle laufenden Editionen an
--    (Fund Build-Session: eine neue Pflicht erschien bei bestehenden Organisationen erst nach manuellem Resync).
-- 2) applications_for_session gibt person_id ohne Einwilligung nur noch dem Team heraus (Datenminimierung: Partner brauchen
--    für eine verborgene Bewerbung keine Personen-ID).
set search_path = public, extensions;

create or replace function upsert_deliverable_template(p_data jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; r record; v_synced integer := 0;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_data ? 'fulfilled_by_sku' and nullif(p_data->>'fulfilled_by_sku', '') is not null and not exists (select 1 from product where sku = p_data->>'fulfilled_by_sku') then
    raise exception 'unknown_sku' using errcode = '22023', detail = p_data->>'fulfilled_by_sku';
  end if;
  if v_id is null then
    if nullif(p_data->>'key', '') is null or nullif(p_data->>'type', '') is null or nullif(p_data->>'label_de', '') is null or nullif(p_data->>'label_en', '') is null then
      raise exception 'fields_required' using errcode = '22023';
    end if;
    insert into deliverable_template (key, product_sku, category, type, label_de, label_en, description_de, description_en, due_rule, file_rules, required, audience_roles, sort, active, answers_schema, fulfilled_by_sku)
    values (p_data->>'key', nullif(p_data->>'product_sku', ''), nullif(p_data->>'category', ''), p_data->>'type', p_data->>'label_de', p_data->>'label_en',
            nullif(p_data->>'description_de', ''), nullif(p_data->>'description_en', ''), coalesce(p_data->'due_rule', '{}'::jsonb), p_data->'file_rules',
            coalesce((p_data->>'required')::boolean, true), coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'audience_roles') x), '{primary_ops,additional}'),
            coalesce((p_data->>'sort')::integer, 100), coalesce((p_data->>'active')::boolean, true), p_data->'answers_schema', nullif(p_data->>'fulfilled_by_sku', ''))
    returning id into v_id;
  else
    update deliverable_template set
      label_de = coalesce(nullif(p_data->>'label_de', ''), label_de), label_en = coalesce(nullif(p_data->>'label_en', ''), label_en),
      description_de = case when p_data ? 'description_de' then nullif(p_data->>'description_de', '') else description_de end,
      description_en = case when p_data ? 'description_en' then nullif(p_data->>'description_en', '') else description_en end,
      due_rule = case when p_data ? 'due_rule' then p_data->'due_rule' else due_rule end,
      file_rules = case when p_data ? 'file_rules' then p_data->'file_rules' else file_rules end,
      required = case when p_data ? 'required' then (p_data->>'required')::boolean else required end,
      sort = case when p_data ? 'sort' then (p_data->>'sort')::integer else sort end,
      active = case when p_data ? 'active' then (p_data->>'active')::boolean else active end,
      answers_schema = case when p_data ? 'answers_schema' then p_data->'answers_schema' else answers_schema end,
      fulfilled_by_sku = case when p_data ? 'fulfilled_by_sku' then nullif(p_data->>'fulfilled_by_sku', '') else fulfilled_by_sku end
    where id = v_id;
    if not found then raise exception 'template_not_found' using errcode = 'P0002'; end if;
  end if;
  -- Bestehende Organisationen laufender Editionen sofort nachziehen (neue Pflicht erscheint, entfallene wird not_required)
  for r in select e.id from event e where e.is_edition and coalesce(e.end_date, current_date) >= current_date loop
    v_synced := v_synced + resync_deliverables(r.id);
  end loop;
  perform log_audit('partner.template', 'deliverable_template', v_id::text, null, p_data || jsonb_build_object('resynced_org_editions', v_synced));
  return v_id;
end $$;

create or replace function applications_for_session(p_session_id uuid)
returns table (id uuid, person_id uuid, display_name text, status text, rank integer, answers jsonb, consent_share boolean, confirm_by timestamptz,
               confirmed_at timestamptz, decided_at timestamptz, created_at timestamptz, profile jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_team boolean;
begin
  if not can_decide_session(p_session_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_team := is_application_team(p_session_id);
  return query
    select a.id,
           case when v_team or a.consent_share then a.person_id end,
           case when v_team or a.consent_share
                then nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') end,
           a.status, a.rank,
           case when v_team or a.consent_share then a.answers end,
           a.consent_share, a.confirm_by, a.confirmed_at, a.decided_at, a.created_at,
           case when v_team or a.consent_share then jsonb_strip_nulls(jsonb_build_object(
             'occupation_status', p.occupation_status, 'career_level', p.career_level,
             'employer_name', p.employer_name, 'university', p.university,
             'study_field', p.study_field, 'city', p.city, 'linkedin_url', p.linkedin_url)) end
    from application a
    join person p on p.id = a.person_id
    where a.session_id = p_session_id
    order by case a.status when 'confirmed' then 0 when 'accepted' then 1 when 'promoted' then 1
                           when 'shortlisted' then 2 when 'applied' then 3 when 'waitlisted' then 4 else 5 end,
             a.rank nulls last, a.created_at;
end $$;

select harden_definer_functions();
