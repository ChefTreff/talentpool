-- =============================================================================
-- 0019 · v2 Härtung 3: Tabellen-Grants auch auf Views entziehen
-- 0018 nahm anon/authenticated TRUNCATE/REFERENCES/TRIGGER nur auf Tabellen
-- (relkind r/p). Die acht Views in public trugen dieselben Standardgrants
-- (Default-ACL). Jetzt schließt harden_definer_functions() Views und
-- Materialized Views ein; die Prüfung im Test v2_programme_editor erwartet 0.
-- =============================================================================
set search_path = public, extensions;

create or replace function harden_definer_functions() returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    n := n + 1;
  end loop;
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f'
      and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function %s set search_path = public, extensions', r.sig);
  end loop;
  execute 'grant execute on all functions in schema public to service_role';
  for r in
    select c.oid::regclass as rel
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  loop
    execute format('revoke truncate, references, trigger on %s from anon, authenticated', r.rel);
  end loop;
  execute 'alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from anon, authenticated';
  return n;
end $$;

select harden_definer_functions();
