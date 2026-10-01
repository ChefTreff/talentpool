-- 00NN · Einwilligungen und Sperrliste einsehen (ADM-033 + ADM-035, Konrad 25.09.2026: „passt")
--
-- Zweck:
--   * ADM-033: Einwilligungen werden versioniert in `consent_record` erfasst,
--     aber im Portal war nicht nachweisbar, wer wann welcher Fassung zugestimmt
--     oder widerrufen hat. Jetzt: Liste in der Verwaltung und die Geschichte je
--     Person.
--   * ADM-035: Die Sperrliste (`suppression`) wird bei jedem Versand und Import
--     geprüft, war aber nirgends einsehbar. Jetzt: Übersicht nach Grund und
--     Zeitpunkt, Suche nach einer Adresse, Eintrag von Hand.
--
-- **Die Sperrliste kennt keine Adressen**, nur `sha256(lower(email))` — das ist
-- ihr Sinn: eine gelöschte Person soll nicht als Liste von Adressen
-- weiterleben. Eine Ansicht „alle gesperrten Adressen" kann es deshalb nicht
-- geben und soll es nicht geben. Wer wissen will, ob eine Adresse gesperrt
-- ist, gibt sie ein; verglichen wird der Hash.
--
-- Eintrag von Hand nur mit drei Gründen: `unsubscribed` (Abmeldung auf anderem
-- Weg, etwa per Mail), `hard_bounce`, `manual` (Bitte am Telefon). Der Grund
-- `profile_deleted` bleibt `anonymize_person` vorbehalten. **Kein Entfernen**:
-- ein Eintrag aus einer Löschung käme sonst über den nächsten Import zurück.
--
-- Beide Bereiche nur für `admin` (Abschnitte `consents`, `suppression`,
-- Gruppe Verwaltung).
set search_path = public, extensions;

insert into admin_section_role (section, role) values
  ('consents', 'admin'),
  ('suppression', 'admin');

-- ---------------------------------------------------------------------------
-- Einwilligungen: Liste mit Filter, oder die Geschichte einer Person.
create or replace function consent_records_admin(
  p_person_id uuid DEFAULT NULL::uuid,
  p_type text DEFAULT NULL::text,
  p_state text DEFAULT NULL::text,
  p_query text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, person_id uuid, person_name text, email text, consent_type text, version text,
               granted boolean, granted_at timestamp with time zone, revoked_at timestamp with time zone,
               source text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('consents') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_state is not null and p_state not in ('granted', 'declined', 'revoked') then
    raise exception 'invalid_state' using errcode = '22023', detail = p_state;
  end if;

  return query
    select c.id, c.person_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           (select pe.email::text from person_email pe where pe.person_id = c.person_id and pe.is_primary),
           c.consent_type, c.version, c.granted, c.granted_at, c.revoked_at, c.source,
           count(*) over ()
      from consent_record c
      join person p on p.id = c.person_id
     where (p_person_id is null or c.person_id = p_person_id)
       and (p_type is null or c.consent_type = p_type)
       and (p_state is null
            or (p_state = 'revoked' and c.revoked_at is not null)
            or (p_state = 'granted' and c.granted and c.revoked_at is null)
            or (p_state = 'declined' and not c.granted and c.revoked_at is null))
       and (v_q is null
            or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike '%' || v_q || '%'
            or exists (select 1 from person_email pe where pe.person_id = c.person_id and pe.email::text ilike '%' || v_q || '%'))
     order by coalesce(c.revoked_at, c.granted_at) desc, c.id
     limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0));
end $$;

-- ---------------------------------------------------------------------------
-- Sperrliste: Zahlen je Grund. Keine Hashes nach aussen — sie sagen niemandem
-- etwas und wären nur eine zweite Kopie der Liste.
create or replace function suppression_overview()
 RETURNS TABLE(reason text, entries bigint, first_at timestamp with time zone, last_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('suppression') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select s.reason, count(*), min(s.created_at), max(s.created_at)
      from suppression s group by s.reason order by count(*) desc, s.reason;
end $$;

-- Ist diese Adresse gesperrt? Verglichen wird der Hash; die Adresse wird nicht
-- gespeichert und nicht protokolliert.
create or replace function suppression_check(p_email text)
 RETURNS TABLE(suppressed boolean, reason text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_mail text := lower(nullif(btrim(coalesce(p_email, '')), ''));
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('suppression') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_mail is null or v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023', detail = coalesce(v_mail, 'null');
  end if;
  return query
    select true, s.reason, s.created_at from suppression s where s.email_hash = email_hash(v_mail)
    union all
    select false, null::text, null::timestamptz
     where not exists (select 1 from suppression s where s.email_hash = email_hash(v_mail));
end $$;

-- Eintrag von Hand. Ins Protokoll kommt der Hash, nie die Adresse.
create or replace function add_suppression(p_email text, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_mail text := lower(nullif(btrim(coalesce(p_email, '')), '')); v_hash text; v_n integer; v_neu boolean;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('suppression') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_mail is null or v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023', detail = coalesce(v_mail, 'null');
  end if;
  if p_reason is null or p_reason not in ('unsubscribed', 'hard_bounce', 'manual') then
    raise exception 'invalid_reason' using errcode = '22023', detail = coalesce(p_reason, 'null');
  end if;
  v_hash := email_hash(v_mail);
  insert into suppression (email_hash, reason) values (v_hash, p_reason)
  on conflict (email_hash) do nothing;
  get diagnostics v_n = row_count;
  v_neu := v_n > 0;
  -- Ein bestehender Eintrag behält seinen Grund
  -- (eine Löschung bleibt eine Löschung, auch wenn jemand „manuell" dazuschreibt).
  perform log_audit('suppression.added', 'suppression', left(v_hash, 12), null,
                    jsonb_build_object('reason', p_reason, 'new', v_neu));
  return v_neu;
end $$;

select harden_definer_functions();
