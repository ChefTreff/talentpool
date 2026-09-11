-- 0058 · Drei Nachträge aus dem Review zu PR #17 (B7) und Konrads Entscheidungen vom 11.09.:
-- 1) Rollen aus Produkten (product.grants_role, z. B. standbuehne_editor aus I-79895) folgen Buchung und Hauptkontakt jetzt automatisch — Trigger auf
--    org_product und org_membership statt nur im HubSpot-Ingest (Entscheidung 12: automatisch für primary_ops, weitere Kontakte manuell durch das Team).
-- 2) upsert_session: Bühnen-Editoren ohne Programm-/Manager-Recht legen Sessions nur für die eigene Organisation an (host_org_id wird gesetzt bzw. geprüft).
-- 3) HubSpot: Erfolgs-Phase je Edition (event.hubspot_done_stage_id); set_edition_hubspot mit viertem Parameter; hubspot_editions liefert sie.
set search_path = public, extensions;

-- 1) Rollen aus Produkten
create or replace function sync_granted_roles(p_org_id uuid) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare r record; g record; v_n integer := 0; v_cnt integer; v_valid_to timestamptz;
begin
  for r in select oe.edition_id, oe.id as org_edition_id, e.end_date
           from org_edition oe join event e on e.id = oe.edition_id
           where oe.org_id = p_org_id and coalesce(e.end_date, current_date) >= current_date loop
    v_valid_to := case when r.end_date is not null then (r.end_date + 1)::timestamptz else null end;
    -- vergeben: je gebuchtem Produkt mit Rolle × Hauptkontakt (bestehende aktive Zuweisung, auch manuelle, bleibt)
    for g in select distinct pr.grants_role as role from org_product op join product pr on pr.sku = op.product_sku
             where op.org_edition_id = r.org_edition_id and op.status = 'booked' and pr.grants_role is not null loop
      insert into role_assignment (person_id, role, scope_type, scope_id, edition_id, valid_to, note)
      select om.person_id, g.role, 'org', p_org_id, r.edition_id, v_valid_to, 'auto:product'
      from org_membership om
      where om.org_id = p_org_id and om.roles @> '{primary_ops}'
        and not exists (select 1 from role_assignment ra where ra.person_id = om.person_id and ra.role = g.role and ra.scope_type = 'org' and ra.scope_id = p_org_id
                          and (ra.valid_to is null or ra.valid_to > now()));
      get diagnostics v_cnt = row_count; v_n := v_n + v_cnt;
    end loop;
    -- entziehen: automatisch vergebene Rollen, deren Produkt nicht mehr gebucht ist oder deren Person nicht mehr Hauptkontakt ist
    update role_assignment ra set valid_to = now()
     where ra.scope_type = 'org' and ra.scope_id = p_org_id and coalesce(ra.edition_id, r.edition_id) = r.edition_id
       and ra.note in ('auto:product', 'hubspot') and (ra.valid_to is null or ra.valid_to > now()) and ra.valid_from < now()
       and (not exists (select 1 from org_product op join product pr on pr.sku = op.product_sku
                         where op.org_edition_id = r.org_edition_id and op.status = 'booked' and pr.grants_role = ra.role)
            or not exists (select 1 from org_membership om where om.org_id = p_org_id and om.person_id = ra.person_id and om.roles @> '{primary_ops}'));
    get diagnostics v_cnt = row_count; v_n := v_n + v_cnt;
    delete from role_assignment ra
     where ra.scope_type = 'org' and ra.scope_id = p_org_id and coalesce(ra.edition_id, r.edition_id) = r.edition_id
       and ra.note in ('auto:product', 'hubspot') and ra.valid_from >= now()
       and (not exists (select 1 from org_product op join product pr on pr.sku = op.product_sku
                         where op.org_edition_id = r.org_edition_id and op.status = 'booked' and pr.grants_role = ra.role)
            or not exists (select 1 from org_membership om where om.org_id = p_org_id and om.person_id = ra.person_id and om.roles @> '{primary_ops}'));
    get diagnostics v_cnt = row_count; v_n := v_n + v_cnt;
  end loop;
  return v_n;
end $$;
revoke execute on function sync_granted_roles(uuid) from public, anon, authenticated;

create or replace function trg_org_product_roles() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid;
begin
  select oe.org_id into v_org from org_edition oe where oe.id = coalesce(new.org_edition_id, old.org_edition_id);
  if v_org is not null then perform sync_granted_roles(v_org); end if;
  return coalesce(new, old);
end $$;
revoke execute on function trg_org_product_roles() from public, anon, authenticated;
drop trigger if exists trg_org_product_roles on org_product;
create trigger trg_org_product_roles after insert or update of status or delete on org_product for each row execute function trg_org_product_roles();

create or replace function trg_org_membership_roles() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform sync_granted_roles(coalesce(new.org_id, old.org_id));
  return coalesce(new, old);
end $$;
revoke execute on function trg_org_membership_roles() from public, anon, authenticated;
drop trigger if exists trg_org_membership_roles on org_membership;
create trigger trg_org_membership_roles after insert or update of roles or delete on org_membership for each row execute function trg_org_membership_roles();

-- 2) Gastgeberin einer Session bei Bühnen-Editoren
create or replace function stage_editor_orgs(p_person_id uuid) returns uuid[]
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(array_agg(distinct x), '{}'::uuid[]) from (
    select ra.scope_id as x from role_assignment ra
     where ra.person_id = p_person_id and ra.role = 'standbuehne_editor' and ra.scope_type = 'org' and ra.scope_id is not null
       and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
    union
    select st.partner_org_id from role_assignment ra join stage st on st.id = ra.scope_id
     where ra.person_id = p_person_id and ra.role = 'standbuehne_editor' and ra.scope_type = 'stage' and st.partner_org_id is not null
       and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
  ) s
$$;
revoke execute on function stage_editor_orgs(uuid) from public, anon, authenticated;

create or replace function upsert_session(p_data jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id    uuid := nullif(p_data->>'id', '')::uuid;
  v_event uuid := nullif(p_data->>'event_id', '')::uuid;
  v_pid   uuid := current_person_id();
  v_host  uuid := nullif(p_data->>'host_org_id', '')::uuid;
  v_allowed uuid[];
begin
  if v_pid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if v_id is null then
    if v_event is null then
      raise exception 'event_id required' using errcode = '22023';
    end if;
    if not (is_programme_editor(v_event) or has_role('speaker_manager') or has_role('standbuehne_editor')) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    -- Bühnen-Editoren ohne Programm-/Manager-Recht: Gastgeberin ist die eigene Organisation
    if not (is_programme_editor(v_event) or has_role('speaker_manager')) then
      v_allowed := stage_editor_orgs(v_pid);
      if v_host is null and cardinality(v_allowed) = 1 then v_host := v_allowed[1]; end if;
      if v_host is null or not (v_host = any(v_allowed)) then
        raise exception 'not allowed' using errcode = '42501', detail = 'host_org_required';
      end if;
    end if;
    insert into session (
      event_id, title_de, title_en, description_de, description_en,
      format, language, access_mode, eligibility_rule, capacity, ticket_required,
      application_deadline, confirm_by_hours, host_org_id, track_id, moderation_person_id,
      tags, created_by, updated_by
    ) values (
      v_event,
      nullif(btrim(p_data->>'title_de'), ''),
      nullif(btrim(p_data->>'title_en'), ''),
      nullif(btrim(p_data->>'description_de'), ''),
      nullif(btrim(p_data->>'description_en'), ''),
      coalesce(p_data->>'format', 'keynote'),
      coalesce(p_data->>'language', 'de'),
      coalesce(p_data->>'access_mode', 'open'),
      p_data->'eligibility_rule',
      nullif(p_data->>'capacity', '')::integer,
      coalesce((p_data->>'ticket_required')::boolean, true),
      nullif(p_data->>'application_deadline', '')::timestamptz,
      coalesce(nullif(p_data->>'confirm_by_hours', '')::integer, 72),
      v_host,
      nullif(p_data->>'track_id', '')::uuid,
      nullif(p_data->>'moderation_person_id', '')::uuid,
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_data->'tags', '[]'::jsonb)) x), '{}'),
      v_pid, v_pid
    ) returning id into v_id;
    perform log_audit('session.create', 'session', v_id::text, null, p_data);
    return v_id;
  end if;

  if not can_edit_session(v_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select s.event_id into v_event from session s where s.id = v_id;
  if p_data ? 'host_org_id' and not (is_programme_editor(v_event) or has_role('speaker_manager')) then
    v_allowed := stage_editor_orgs(v_pid);
    if v_host is null or not (v_host = any(v_allowed)) then
      raise exception 'not allowed' using errcode = '42501', detail = 'host_org_required';
    end if;
  end if;

  update session set
    title_de       = case when p_data ? 'title_de'       then nullif(btrim(p_data->>'title_de'), '')       else title_de       end,
    title_en       = case when p_data ? 'title_en'       then nullif(btrim(p_data->>'title_en'), '')       else title_en       end,
    description_de = case when p_data ? 'description_de' then nullif(btrim(p_data->>'description_de'), '') else description_de end,
    description_en = case when p_data ? 'description_en' then nullif(btrim(p_data->>'description_en'), '') else description_en end,
    format         = coalesce(p_data->>'format', format),
    language       = coalesce(p_data->>'language', language),
    access_mode    = coalesce(p_data->>'access_mode', access_mode),
    eligibility_rule = coalesce(p_data->'eligibility_rule', eligibility_rule),
    capacity       = case when p_data ? 'capacity' then nullif(p_data->>'capacity', '')::integer else capacity end,
    ticket_required = coalesce((p_data->>'ticket_required')::boolean, ticket_required),
    application_deadline = case when p_data ? 'application_deadline' then nullif(p_data->>'application_deadline', '')::timestamptz else application_deadline end,
    confirm_by_hours = coalesce(nullif(p_data->>'confirm_by_hours', '')::integer, confirm_by_hours),
    host_org_id    = case when p_data ? 'host_org_id' then v_host else host_org_id end,
    track_id       = case when p_data ? 'track_id' then nullif(p_data->>'track_id', '')::uuid else track_id end,
    moderation_person_id = case when p_data ? 'moderation_person_id' then nullif(p_data->>'moderation_person_id', '')::uuid else moderation_person_id end,
    tags           = case when p_data ? 'tags' then coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'tags') x), '{}') else tags end,
    updated_by     = v_pid
  where id = v_id;
  perform log_audit('session.update', 'session', v_id::text, null, p_data);
  return v_id;
end $$;

-- 3) HubSpot-Erfolgs-Phase
alter table event add column if not exists hubspot_done_stage_id text;
comment on column event.hubspot_done_stage_id is 'HubSpot-Phase, in die ein Deal nach gelungenem Ingest geschoben wird (z. B. „Onboarding Operations (Automation Complete)“); leer = kein Weiterschieben.';

drop function if exists set_edition_hubspot(uuid, text, text);
create or replace function set_edition_hubspot(p_edition_id uuid, p_pipeline_id text, p_stage_id text, p_done_stage_id text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  update event set hubspot_pipeline_id = nullif(btrim(coalesce(p_pipeline_id, '')), ''),
                   hubspot_onboarding_stage_id = nullif(btrim(coalesce(p_stage_id, '')), ''),
                   hubspot_done_stage_id = nullif(btrim(coalesce(p_done_stage_id, '')), '')
   where id = p_edition_id and is_edition;
  if not found then raise exception 'edition_not_found' using errcode = 'P0002'; end if;
  perform log_audit('edition.hubspot', 'event', p_edition_id::text, null,
                    jsonb_build_object('pipeline_id', p_pipeline_id, 'stage_id', p_stage_id, 'done_stage_id', p_done_stage_id));
end $$;

drop function if exists hubspot_editions();
create function hubspot_editions()
returns table (edition_id uuid, slug text, name text, pipeline_id text, stage_id text, done_stage_id text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select e.id, e.slug, e.name, e.hubspot_pipeline_id, e.hubspot_onboarding_stage_id, e.hubspot_done_stage_id
    from event e where e.is_edition and e.hubspot_pipeline_id is not null and e.hubspot_onboarding_stage_id is not null
    order by e.start_date desc nulls last;
end $$;

select harden_definer_functions();
