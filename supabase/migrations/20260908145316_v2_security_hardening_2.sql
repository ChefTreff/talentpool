-- =============================================================================
-- 0012 · v2 Härtung 2 — wiederverwendbarer Helper
--   Befund: Funktionen aus 0009 waren trotz Default-Privilegien (0008) wieder für
--   anon ausführbar (Default-Privilegien gelten nur je erzeugender Rolle).
--   Lösung: harden_definer_functions() entzieht public/anon das EXECUTE auf allen
--   SECURITY-DEFINER-Funktionen in public und pinnt fehlende search_paths.
--   REGEL: Jede Migration endet mit `select harden_definer_functions();`
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
  return n;
end $$;
revoke execute on function harden_definer_functions() from public, anon, authenticated;
comment on function harden_definer_functions() is 'Am Ende jeder Migration aufrufen: anon/public verlieren EXECUTE auf SECURITY-DEFINER-Funktionen, search_path wird gepinnt.';

-- Default-Privilegien für die ausführende Rolle (Migrationsrunner)
do $$
begin
  execute format('alter default privileges for role %I in schema public revoke execute on functions from public', current_user);
  execute format('alter default privileges for role %I in schema public revoke execute on functions from anon',   current_user);
end $$;

select harden_definer_functions();
