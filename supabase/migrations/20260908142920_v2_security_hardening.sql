-- =============================================================================
-- 0008 · v2 Sicherheits-Härtung (Befunde Supabase Security Advisor, 08.09.2026)
--   1. Views aus 0001 laufen mit den Rechten des Aufrufers (security_invoker)
--   2. Alle Funktionen pinnen den search_path
--   3. anon darf keine SECURITY-DEFINER-Funktion aufrufen (nur eingeloggte Nutzer)
--   4. Default-Privilegien: neue Funktionen sind nicht mehr automatisch für
--      public/anon ausführbar (Grants müssen explizit erfolgen)
-- Hinweis: "RLS enabled, no policy" ist für service-role-only-Tabellen beabsichtigt
-- (organization, org_membership, staff_user, audit_log, suppression, import.*, Dedup).
-- =============================================================================
set search_path = public, extensions;

-- 1 · Views: RLS des Aufrufers statt des Erstellers
alter view person_eligibility       set (security_invoker = true);
alter view person_lifecycle         set (security_invoker = true);
alter view person_lifecycle_current set (security_invoker = true);

-- 2 · search_path pinnen (alle Funktionen in public ohne gesetzten search_path)
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and (p.proconfig is null or not exists (
            select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function %s set search_path = public, extensions', r.sig);
  end loop;
end $$;

-- 3 · SECURITY-DEFINER-Funktionen: kein Aufruf durch anon/public
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end $$;
-- current_person_id() wird nur in Policies für authenticated genutzt; anon braucht es nicht.

-- 4 · Default-Privilegien für künftige Funktionen (Objekte des Migrations-Owners)
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
