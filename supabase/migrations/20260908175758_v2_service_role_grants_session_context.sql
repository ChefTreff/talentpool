-- =============================================================================
-- 0014 · v2 service_role-Grants, session_context(), Hackathon-Rollen
--   Befunde aus dem Review von PR #1:
--   1. Seit 0008 bekommen neue Funktionen kein EXECUTE mehr für public — damit auch
--      nicht für service_role. Der Server (nach requireRole) muss aber z. B.
--      log_audit()/is_suppressed() aufrufen dürfen → Grant für service_role, jetzt
--      und für künftige Funktionen; harden_definer_functions() sichert das mit.
--   2. session_context(): ein RPC statt drei (my_roles, is_staff, person) je Request.
--   3. Rollen hackathon_participant / hackathon_partner ins Vokabular (Masterplan §1
--      Hackathon: Teilnehmer + Partner produktbasiert).
-- =============================================================================
set search_path = public, extensions;

grant execute on all functions in schema public to service_role;
do $$
begin
  execute format('alter default privileges for role %I in schema public grant execute on functions to service_role', current_user);
end $$;

create or replace function harden_definer_functions() returns integer
  language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    n := n + 1;
  end loop;

  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prokind = 'f'
      and (p.proconfig is null or not exists (
            select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function %s set search_path = public, extensions', r.sig);
  end loop;

  -- Server (service_role, nur nach Rollenprüfung) darf jede Funktion aufrufen
  execute 'grant execute on all functions in schema public to service_role';
  return n;
end $$;
revoke execute on function harden_definer_functions() from public, anon, authenticated;

-- === session_context(): Rollen, Staff-Flag und Profil-Basics in einem Aufruf ==
create or replace function session_context() returns jsonb
  language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'person_id',          p.id,
    'first_name',         p.first_name,
    'preferred_language', p.preferred_language,
    'tier',               p.tier,
    'is_staff',           is_staff(),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role', r.role, 'scope_type', r.scope_type, 'scope_id', r.scope_id,
        'edition_id', r.edition_id, 'portal', r.portal, 'valid_to', r.valid_to))
      from my_roles() r), '[]'::jsonb)
  )
  from person p
  where p.id = current_person_id()
$$;
grant execute on function session_context() to authenticated;
comment on function session_context() is 'Ein RPC für Proxy/Layout: Person-Basics, Rollen (aktiv), is_staff. NULL, wenn zum Auth-User noch keine Person existiert.';

-- === Rollen-Vokabular: Hackathon ============================================
insert into vocab_term (vocabulary, key, label_de, label_en, sort_order) values
  ('role','hackathon_participant','Hackathon-Teilnehmer','Hackathon participant',19),
  ('role','hackathon_partner','Hackathon-Partner','Hackathon partner',20)
on conflict (vocabulary, key) do update
  set label_de = excluded.label_de, label_en = excluded.label_en, sort_order = excluded.sort_order, active = true;

select harden_definer_functions();
