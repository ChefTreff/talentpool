-- 0222 · Löschantrag durch das Team für Personen ohne Konto, Hürden der betroffenen Person (ADM-031)
-- Angewendet von der Architektur-Session am 01.10.2026 als 20261001081110.
--
-- Zweck: Bisher entstand ein Löschantrag nur, wenn die Person ihn selbst im
-- Portal stellte (`request_profile_deletion`). Zwei Fälle hatten damit keinen
-- Weg:
--   1. Die Bitte kommt per Mail oder Telefon beim Team an.
--   2. Die Person hat **kein Konto** — importierte Kontakte, Talentpool aus
--      dem Altbestand, Speaker-Kandidaten aus der Recherche. Sie kann sich nie
--      anmelden, also auch nie selbst löschen; ihr Recht nach Art. 17 läuft
--      vollständig über das Team.
-- Für beide gab es keinen Knopf: das Team konnte Anträge erledigen, aber
-- keinen anlegen.
--
-- Entscheidung: Das Team **legt an**, erledigt wird in der bestehenden
-- Warteschlange über `resolve_deletion_request`. Es gibt damit weiterhin genau
-- einen Weg, auf dem eine Admin-Person löscht — mit Hürdenanzeige,
-- Bestätigung und Protokoll. Ein vom Team angelegter Antrag ist **immer**
-- `pending`, auch ohne Hürden: wer für jemand anderen löscht, soll es in der
-- Warteschlange noch einmal bewusst bestätigen.
--
-- Teile:
--   * `profile_deletion_request.opened_by` — wer den Antrag angelegt hat;
--     leer heisst: die Person selbst.
--   * `deletion_blockers(person)` — die Hürden für eine **beliebige** Person,
--     intern. `my_deletion_blockers()` ruft sie jetzt mit der eigenen Person
--     auf; die Regeln stehen damit an einer Stelle.
--   * `open_deletion_request(person, note)` — nur Admin, Audit.
--   * `deletion_requests_admin` gibt zusätzlich `opened_by_name` zurück
--     (Rückgabetyp ändert sich ⇒ drop + create).
--
-- Basis: snapshot/functions/my_deletion_blockers.sql und
-- deletion_requests_admin.sql (Live-Fassung, Stand 01.10.2026).
set search_path = public, extensions;

alter table profile_deletion_request
  add column opened_by uuid references person(id);

comment on column profile_deletion_request.opened_by is
  'Wer den Antrag angelegt hat (ADM-031). Leer = die Person selbst im Portal; gesetzt = das Team, etwa nach einer Mail oder für eine Person ohne Konto.';

-- ---------------------------------------------------------------------------
-- Hürden für eine beliebige Person. Intern: sie verrät, woran jemand hängt
-- (Organisation, Auftritt, Reisekosten) — das geht nur die Person selbst und
-- das Team etwas an.
create or replace function deletion_blockers(p_person_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_out text[] := '{}';
begin
  if p_person_id is null then raise exception 'person_not_found' using errcode = 'P0002'; end if;

  -- Teamrolle: wer den Betrieb mitträgt, verschwindet nicht per Selbstbedienung.
  if exists (
    select 1 from role_assignment ra
     where ra.person_id = p_person_id and ra.role = any (team_role_keys())
       and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()))
  then v_out := array_append(v_out, 'team_role'); end if;

  -- Zugesagter Auftritt einer Edition, die noch bevorsteht.
  if exists (
    select 1 from speaker_profile sp join event e on e.id = sp.edition_id
     where (sp.person_id = p_person_id or is_speaker_assistant(sp.id, p_person_id))
       and sp.confirmed_at is not null and sp.declined_at is null
       and e.end_date >= current_date)
  then v_out := array_append(v_out, 'speaker'); end if;

  -- Angenommene Volunteer-Bewerbung einer Edition, die noch bevorsteht.
  if exists (
    select 1 from volunteer_profile vp join event e on e.id = vp.edition_id
     where vp.person_id = p_person_id and vp.status = 'accepted' and e.end_date >= current_date)
  then v_out := array_append(v_out, 'volunteer'); end if;

  -- Ansprechperson einer Organisation: an der Stelle hängt ein Vertrag.
  if exists (select 1 from org_membership om where om.person_id = p_person_id)
  then v_out := array_append(v_out, 'partner'); end if;

  -- Offener Reisekostenantrag: eine Zahlung, die uns die Person noch schuldet
  -- oder wir ihr. Bis die durch ist, kann niemand verschwinden — und danach
  -- dürfen die Bankdaten weg, ohne dass eine Erstattung ins Leere läuft.
  if exists (
    select 1 from expense_claim ec join speaker_profile sp on sp.id = ec.profile_id
     where sp.person_id = p_person_id and ec.paid_at is null
       and ec.status not in ('rejected', 'cancelled', 'draft'))
  then v_out := array_append(v_out, 'open_expense'); end if;

  return v_out;
end $$;

revoke execute on function deletion_blockers(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Die eigene Sicht bleibt, wie sie war — nur die Regeln wohnen jetzt oben.
create or replace function my_deletion_blockers()
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return deletion_blockers(v_me);
end $$;

-- ---------------------------------------------------------------------------
create or replace function open_deletion_request(p_person_id uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_b text[]; v_id uuid; v_deleted timestamptz; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;

  select p.deleted_at into v_deleted from person p where p.id = p_person_id;
  if not found then
    raise exception 'person_not_found' using errcode = 'P0002', detail = coalesce(p_person_id::text, 'null');
  end if;
  if v_deleted is not null then
    raise exception 'person_already_deleted' using errcode = 'P0001', detail = v_deleted::text;
  end if;
  if exists (select 1 from profile_deletion_request r where r.person_id = p_person_id and r.status = 'pending') then
    raise exception 'deletion_already_open' using errcode = 'P0001';
  end if;

  v_b := deletion_blockers(p_person_id);

  -- Immer `pending`: auch ohne Hürde bestätigt das Team die Löschung in der
  -- Warteschlange noch einmal ausdrücklich. Keine Mail an die Person — die
  -- Bitte kam über einen anderen Weg, und die Antwort geht denselben Weg.
  insert into profile_deletion_request (person_id, reason, blockers, status, opened_by)
  values (p_person_id, v_note, v_b, 'pending', current_person_id())
  returning id into v_id;

  perform log_audit('profile.delete_opened', 'person', p_person_id::text, null,
                    jsonb_build_object('request_id', v_id, 'blockers', to_jsonb(v_b)));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
drop function if exists deletion_requests_admin(text);
create function deletion_requests_admin(p_status text DEFAULT 'pending'::text)
 RETURNS TABLE(id uuid, person_id uuid, person_name text, email text, reason text, blockers text[], status text, requested_at timestamp with time zone, handled_by_name text, handled_at timestamp with time zone, handled_note text, opened_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select r.id, r.person_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           (select pe.email::text from person_email pe
             where pe.person_id = r.person_id and pe.is_primary),
           r.reason, r.blockers, r.status, r.requested_at,
           nullif(btrim(coalesce(h.first_name, '') || ' ' || coalesce(h.last_name, '')), ''),
           r.handled_at, r.handled_note,
           nullif(btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')), '')
      from profile_deletion_request r
      join person p on p.id = r.person_id
      left join person h on h.id = r.handled_by
      left join person o on o.id = r.opened_by
     where p_status is null or r.status = p_status
     order by r.requested_at desc;
end $$;

select harden_definer_functions();
