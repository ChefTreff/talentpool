create or replace function duplicate_scan()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('duplicates') then raise exception 'not allowed' using errcode = '42501'; end if;

  with p as (
    select id, linkedin_normalized, phone_e164, birthdate,
           nullif(immutable_unaccent(lower(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')))), '') as nm
      from person where deleted_at is null
  ), pairs as (
    select a.id as a, b.id as b, 'linkedin' as sig, 0.9 as w from p a join p b on a.id < b.id and a.linkedin_normalized = b.linkedin_normalized
    union all
    select a.id, b.id, 'phone', 0.8 from p a join p b on a.id < b.id and a.phone_e164 = b.phone_e164
    union all
    select a.id, b.id, 'name_birthdate', 0.9 from p a join p b on a.id < b.id and a.nm = b.nm and a.birthdate = b.birthdate
    union all
    select a.id, b.id, 'name', 0.5 from p a join p b on a.id < b.id and a.nm = b.nm and position(' ' in a.nm) > 0
  ), agg as (
    select a, b, jsonb_object_agg(sig, true) as signals,
           least(1.0, max(w) + 0.05 * (count(*) - 1))::numeric(3, 2) as score
      from pairs group by a, b
  ), ins as (
    insert into potential_duplicate (person_id_a, person_id_b, score, signals)
    select a, b, score, signals from agg
    on conflict (person_id_a, person_id_b) do update
      set signals = excluded.signals, score = excluded.score
      where potential_duplicate.status = 'open'
    returning (xmax = 0) as neu
  )
  select count(*) filter (where neu) into v_n from ins;

  perform log_audit('duplicate.scan', 'potential_duplicate', 'scan', null, jsonb_build_object('new', v_n));
  return v_n;
end $$;
