-- 0062 · Welle 3 A11 (Sanity): allgemeine Referenzpflege für Integrationen — set_external_ref/list_external_refs für service_role oder Partner-Team,
-- Systeme auf eine Liste beschränkt (sanity, swapcard). Der Sanity-Veröffentlicher merkt sich je Org×Edition die Dokument-ID und die veröffentlichte Logo-Fassung.
set search_path = public, extensions;

create or replace function set_external_ref(p_system text, p_object_type text, p_object_id uuid, p_external_id text, p_meta jsonb default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_system not in ('sanity', 'swapcard') then raise exception 'invalid_system' using errcode = '22023', detail = p_system; end if;
  if p_object_type !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'invalid_object_type' using errcode = '22023', detail = p_object_type; end if;
  if nullif(btrim(coalesce(p_external_id, '')), '') is null then raise exception 'external_id_required' using errcode = '22023'; end if;
  insert into external_ref (system, object_type, object_id, external_id, meta)
  values (p_system, p_object_type, p_object_id, btrim(p_external_id), coalesce(p_meta, '{}'::jsonb))
  on conflict (system, object_type, object_id) do update set external_id = excluded.external_id, meta = excluded.meta, updated_at = now();
end $$;

create or replace function list_external_refs(p_system text, p_object_type text)
returns table (object_id uuid, external_id text, meta jsonb, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select r.object_id, r.external_id, r.meta, r.updated_at from external_ref r
    where r.system = p_system and r.object_type = p_object_type
    order by r.updated_at desc;
end $$;

select harden_definer_functions();
