create or replace function set_event_app_person_ref(p_person_id uuid, p_system text, p_external_id text, p_meta jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  -- Servermuster: der Lauf läuft unter der Service Role, wo `has_role()` immer
  -- false ist (Lehre 0120). Aus einem angemeldeten Kontext ist der Weg zu.
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_system not in ('swapcard') then raise exception 'invalid_system' using errcode = '22023', detail = p_system; end if;
  if nullif(btrim(coalesce(p_external_id, '')), '') is null then raise exception 'external_id_required' using errcode = '22023'; end if;
  if not exists (select 1 from person where id = p_person_id and deleted_at is null) then
    raise exception 'person_not_found' using errcode = 'P0002', detail = coalesce(p_person_id::text, 'null');
  end if;
  insert into external_ref (system, object_type, object_id, external_id, meta)
  values (p_system, 'person', p_person_id, btrim(p_external_id), coalesce(p_meta, '{}'::jsonb))
  on conflict (system, object_type, object_id) do update set external_id = excluded.external_id, meta = excluded.meta, updated_at = now();
end $$;
