-- 0209 · Zugänge sperren und einladen in der Verwaltung, Sperrprüfung in den sechs Rollen-Funktionen (PORT4b)
-- Angewendet von der Architektur-Session am 25.09.2026 als 20260925170219.
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: PORT4 — der Bereich **Verwaltung** braucht einen Weg, einem Konto den Zugang zu nehmen.
-- „Alt-Systeme nur deaktivieren, nie loeschen" gilt auch fuer Menschen: wer geht, verliert den
-- Zugang, nicht seine Geschichte.
--
-- **Der Befund, der den Schnitt bestimmt.** Eine Sperre laesst sich **nicht** an einer Stelle
-- einbauen. `active_roles()` sieht nach dem Flaschenhals aus, ist es aber nicht: `has_role()` liest
-- `role_assignment` direkt. Genau **sechs** Funktionen filtern Rollen ueber `current_person_id()` —
-- `active_roles`, `has_role`, `my_roles`, `is_kiosk_only`, `checkin_edition`, `can_edit_edition_info`.
-- Eine Sperre, die nur in einer davon greift, ist schlimmer als keine: sie sieht wie Schutz aus.
-- Alle sechs tragen sie jetzt, und `tests/zugaenge.test.ts` haelt fest, dass keine siebte dazukommt,
-- ohne sie mitzunehmen.
--
-- **Warum nicht `current_person_id()` selbst.** Dort ein NULL zurueckzugeben waere der eine Griff
-- gewesen — und viel zu grob: die Funktion beantwortet ueberall „wer bin ich", nicht „was darf ich".
-- Eine gesperrte Person saehe dann aus wie jemand ohne Profil, und Funktionen wie
-- `request_profile_deletion` scheiterten mit „nicht angemeldet" statt mit einer Aussage.
--
-- **`role_assignment` wird nicht angefasst.** Die Rechte abzuraeumen waere das Naheliegende und
-- unumkehrbar: das Entsperren stellte nicht wieder her, was vorher galt. Die Sperre ist ein
-- Zeitstempel an der Person, sonst nichts.
--
-- **Sich selbst sperrt niemand.** Sonst nimmt Konrad sich mit einem Klick den Zugang zu genau der
-- Seite, auf der man ihn zuruecknimmt. Eigener Schluessel `cannot_block_self`.
--
-- K-42 (unbeantwortet, Empfehlung der Architektur-Session angewendet): zusaetzlich wird das
-- Auth-Konto gebannt — reversibel, das Entsperren hebt beides auf. Das erledigt die Anwendung ueber
-- den Admin-Client; die Datenbank fuehrt den Stand und das Audit.
-- Test: `supabase/tests/v6_zugaenge.sql`.

alter table person add column if not exists access_blocked_at timestamptz;
comment on column person.access_blocked_at is
  'Zugang gesperrt seit (PORT4b). Gesetzt heisst: keine Rollen, kein Bereich — die Person und ihre Geschichte bleiben. Zusaetzlich bannt die Anwendung das Auth-Konto (K-42); Entsperren hebt beides auf. Nur ueber set_person_access, mit Audit.';

-- 1 · Die sechs Funktionen, durch die jede Rechtefrage geht
create or replace function active_roles()
 RETURNS TABLE(role text, scope_type text, scope_id uuid, edition_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select role, scope_type, scope_id, edition_id
  from role_assignment
  where person_id = current_person_id()
    and valid_from <= now() and (valid_to is null or valid_to > now())
    and not exists (select 1 from person zp where zp.id = current_person_id() and zp.access_blocked_at is not null)
$$;

create or replace function my_roles()
 RETURNS TABLE(role text, scope_type text, scope_id uuid, edition_id uuid, portal text, valid_to timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select role, scope_type, scope_id, edition_id, portal, valid_to
  from role_assignment
  where person_id = current_person_id()
    and valid_from <= now()
    and (valid_to is null or valid_to > now())
    and not exists (select 1 from person zp where zp.id = current_person_id() and zp.access_blocked_at is not null)
$$;

create or replace function has_role(p_role text, p_scope_type text DEFAULT NULL::text, p_scope_id uuid DEFAULT NULL::uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (
    select 1 from role_assignment ra
    where ra.person_id = current_person_id()
      and not exists (select 1 from person zp where zp.id = current_person_id() and zp.access_blocked_at is not null)
      and ra.role = p_role
      and ra.valid_from <= now()
      and (ra.valid_to is null or ra.valid_to > now())
      and (
           ra.scope_type = 'global'
        or p_scope_type is null
        or (ra.scope_type = p_scope_type
            and (p_scope_id is null or ra.scope_id = p_scope_id)
            and (p_edition_id is null or ra.edition_id = p_edition_id))
      )
  )
$$;

create or replace function is_kiosk_only()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (select 1 from role_assignment ra
                  where ra.person_id = current_person_id() and ra.role = 'checkin_operator'
                    and not exists (select 1 from person zp where zp.id = current_person_id() and zp.access_blocked_at is not null)
                    and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()))
     and not exists (select 1 from role_assignment ra
                      where ra.person_id = current_person_id() and ra.role <> 'checkin_operator'
                        and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()))
$$;

create or replace function checkin_edition()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select r.edition_id
    from role_assignment r
    join event e on e.id = r.edition_id and e.is_edition
   where r.person_id = current_person_id()
     and not exists (select 1 from person zp where zp.id = current_person_id() and zp.access_blocked_at is not null)
     and r.role = 'checkin_operator'
     and r.scope_type = 'edition'
     and r.valid_from <= now()
     and (r.valid_to is null or r.valid_to > now())
   order by (current_date between e.start_date and e.end_date) desc, e.start_date desc
   limit 1
$$;

create or replace function can_edit_edition_info()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select has_role('admin') or exists (
    select 1 from role_assignment ra
     where ra.person_id = current_person_id() and ra.role like 'area\_lead\_%'
       and not exists (select 1 from person zp where zp.id = current_person_id() and zp.access_blocked_at is not null)
       and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()))
$$;

-- 2 · Der Abschnitt (Spiegelung von lib/admin-sections.ts, PORT1b) — nur admin
insert into admin_section_role (section, role) values
  ('access', 'admin')
on conflict (section, role) do nothing;

-- 3 · Wer hat einen Zugang, und was darf er?
create or replace function access_accounts(p_query text default null::text,
                                           p_limit integer default 50,
                                           p_offset integer default 0)
 returns table(person_id uuid, name text, email text, has_login boolean,
               blocked_at timestamp with time zone, roles text[], total bigint)
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $$
declare v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
        v_offset integer := greatest(0, coalesce(p_offset, 0));
        v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not has_admin_section('access') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  with kandidaten as (
    -- Wer ein Konto hat **oder** eine Rolle traegt. Beides zusammen, weil beides
    -- Zugang bedeutet: ein Konto ohne Rolle kommt ins Portal, eine Rolle ohne
    -- Konto wartet auf die Einladung — und genau die soll man hier sehen.
    select p.id, p.auth_user_id, p.access_blocked_at,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as name,
           (select pe.email::text from person_email pe
             where pe.person_id = p.id and pe.is_primary limit 1) as email
      from person p
     where p.deleted_at is null
       and (p.auth_user_id is not null
            or exists (select 1 from role_assignment ra where ra.person_id = p.id
                        and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())))
  )
  select k.id, k.name, k.email, k.auth_user_id is not null, k.access_blocked_at,
         coalesce((select array_agg(distinct ra.role order by ra.role)
                     from role_assignment ra
                    where ra.person_id = k.id
                      and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())), '{}'),
         count(*) over ()
    from kandidaten k
   where v_q is null
      or coalesce(k.name, '') ilike '%' || v_q || '%'
      or coalesce(k.email, '') ilike '%' || v_q || '%'
   -- Gesperrte zuerst: wer hier sucht, sucht meistens die.
   order by (k.access_blocked_at is not null) desc, k.name nulls last
   limit v_limit offset v_offset;
end $$;

-- 4 · Sperren und entsperren
create or replace function set_person_access(p_person_id uuid, p_blocked boolean,
                                             p_note text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
declare v_alt timestamptz; v_name text;
begin
  if not has_admin_section('access') then raise exception 'not allowed' using errcode = '42501'; end if;
  -- **Nicht sich selbst.** Sonst nimmt man sich mit einem Klick den Zugang zu
  -- genau der Seite, auf der man ihn zuruecknimmt.
  if p_person_id = current_person_id() then
    raise exception 'cannot_block_self' using errcode = 'P0001';
  end if;
  select p.access_blocked_at, nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
    into v_alt, v_name from person p where p.id = p_person_id and p.deleted_at is null;
  if not found then raise exception 'person_not_found' using errcode = 'P0002', detail = p_person_id::text; end if;
  if (v_alt is not null) = coalesce(p_blocked, false) then return; end if;

  update person set access_blocked_at = case when p_blocked then now() else null end
   where id = p_person_id;
  perform log_audit(case when p_blocked then 'access.blocked' else 'access.unblocked' end,
                    'person', p_person_id::text,
                    jsonb_build_object('access_blocked_at', v_alt),
                    jsonb_build_object('access_blocked_at', case when p_blocked then now() else null end,
                                       'name', v_name,
                                       'note', nullif(btrim(coalesce(p_note, '')), '')));
end $$;

-- 5 · Die Einladung ins Protokoll — mit Namen
create or replace function log_access_invite(p_person_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
begin
  if not has_admin_section('access') then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Ueber die **Nutzer**-Sitzung gerufen, nicht ueber den Service-Client: sonst
  -- stuende im Protokoll „jemand hat eingeladen" statt „Konrad hat eingeladen".
  -- `log_audit` nimmt den Akteur aus `current_person_id()`.
  perform log_audit('access.invited', 'person', p_person_id::text, null,
                    jsonb_build_object('via', 'magic_link'));
end $$;

select harden_definer_functions();
