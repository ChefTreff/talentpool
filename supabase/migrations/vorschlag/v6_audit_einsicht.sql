-- Vorschlag · Welle 6 · Audit-Einsicht in der Verwaltung (PORT4a)
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: PORT4 — der Bereich **Verwaltung** nur fuer Konrad. Das Audit-Log fuellt sich seit Welle 1
-- bei jeder Admin-Aktion; gelesen hat es bisher niemand, ausser ueber die Datenbank. „Audit-Log fuer
-- Admin-Aktionen" steht unter „nicht verhandelbar" — ein Protokoll, das niemand ansehen kann,
-- erfuellt diese Zusage nur auf dem Papier.
--
-- **Zum Gate, mit einer Abweichung vom Zuschnitt.** Dort stand `has_role('admin')`. Ich nehme
-- `has_admin_section('auditLog')` — die Vorgabe des Abschnitts ist `roles: []`, also **ebenfalls nur
-- `admin`**, das Ergebnis ist im Normalfall dasselbe. Der Unterschied zaehlt im Ausnahmefall: traegt
-- Konrad je eine Ausnahme in `/admin/rollen` ein, oeffnete sich mit `has_role('admin')` die **Seite**
-- (die fragt `requireAdminSection`), waehrend die **Daten** mit 42501 abwiesen. Genau dieses
-- Auseinanderlaufen hat PORT1b beseitigt; es hier wieder einzubauen waere ein Rueckschritt.
-- Ausnahmen schreibt ohnehin nur `admin` (`set_admin_section_override`), niemand kann sich selbst
-- eintragen.
--
-- **Kein Export.** Das Protokoll ist zum Nachsehen da, nicht zum Mitnehmen: es enthaelt Vorher- und
-- Nachher-Staende aus dem ganzen System, und eine CSV davon waere eine Kopie der Datenbank in einer
-- Tabelle. Wer etwas belegen muss, zeigt den Eintrag.
--
-- **Seitenweise mit Gesamtzahl.** `total` kommt aus demselben Aufruf: eine zweite Zaehl-RPC waere
-- ein zweiter Filterausdruck, der irgendwann vom ersten abweicht.
--
-- Rechte: SECURITY DEFINER mit gepinntem `search_path`; `harden_definer_functions()` entzieht `anon`
-- das Ausfuehren. Geschrieben wird nichts.
-- Test: `supabase/tests/v6_audit_einsicht.sql`.

-- 1 · Der Abschnitt (Spiegelung von lib/admin-sections.ts, PORT1b) — nur admin
insert into admin_section_role (section, role) values
  ('auditLog', 'admin')
on conflict (section, role) do nothing;

-- 2 · Lesen, gefiltert und seitenweise
create or replace function audit_log_admin(
  p_action text default null::text,
  p_object_type text default null::text,
  p_object_id text default null::text,
  p_actor uuid default null::uuid,
  p_from timestamp with time zone default null::timestamp with time zone,
  p_to timestamp with time zone default null::timestamp with time zone,
  p_limit integer default 50,
  p_offset integer default 0)
 returns table(id bigint, created_at timestamp with time zone, action text,
               object_type text, object_id text, actor_person_id uuid, actor_name text,
               vorher jsonb, nachher jsonb, total bigint)
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
declare v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
        v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if not has_admin_section('auditLog') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  with treffer as (
    select a.id, a.created_at, a.action, a.object_type, a.object_id, a.actor_person_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as actor_name,
           a.before, a.after
      from audit_log a
      left join person p on p.id = a.actor_person_id
     where (p_action is null or a.action = p_action)
       and (p_object_type is null or a.object_type = p_object_type)
       and (p_object_id is null or a.object_id = p_object_id)
       and (p_actor is null or a.actor_person_id = p_actor)
       and (p_from is null or a.created_at >= p_from)
       and (p_to is null or a.created_at < p_to)
  )
  select t.id, t.created_at, t.action, t.object_type, t.object_id, t.actor_person_id, t.actor_name,
         t.before, t.after,
         -- Gesamtzahl aus demselben Ausdruck: eine zweite Zaehlfunktion waere ein
         -- zweiter Filter, der irgendwann vom ersten abweicht.
         count(*) over ()
    from treffer t
   order by t.id desc
   limit v_limit offset v_offset;
end $$;

-- 3 · Womit sich filtern laesst — aus dem Bestand, nicht aus einer gepflegten Liste
create or replace function audit_log_filters()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
begin
  if not has_admin_section('auditLog') then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    -- Nur, was wirklich vorkommt: eine Auswahlliste mit Aktionen, die es nicht
    -- gibt, schickt jeden Filterversuch ins Leere.
    'actions', coalesce((select jsonb_agg(x.action order by x.action)
                           from (select distinct a.action from audit_log a) x), '[]'::jsonb),
    'object_types', coalesce((select jsonb_agg(x.object_type order by x.object_type)
                                from (select distinct a.object_type from audit_log a
                                       where a.object_type is not null) x), '[]'::jsonb),
    'actors', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by x.name)
                          from (select distinct p.id,
                                       nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as name
                                  from audit_log a join person p on p.id = a.actor_person_id) x
                         where x.name is not null), '[]'::jsonb));
end $$;

select harden_definer_functions();
