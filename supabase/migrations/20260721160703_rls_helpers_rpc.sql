-- =============================================================================
-- 0003 · Sicherheit — Helper, RLS-Policies, Spalten-Grants, Onboarding-RPC
-- Modell: Teilnehmer über anon/authenticated-Key mit RLS (nur eigene Daten).
--         Staff + Migration serverseitig über service_role (RLS-Bypass).
-- =============================================================================
set search_path = public, extensions;

-- === Helper (SECURITY DEFINER, search_path gepinnt) ========================
create or replace function current_person_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from person where auth_user_id = auth.uid()
$$;

create or replace function is_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff_user where auth_user_id = auth.uid())
$$;

-- === Onboarding / Claim-RPC ================================================
-- (1) bereits verknüpft? -> zurück  (2) verifizierte E-Mail matcht migrierte
-- Person -> claimen  (3) sonst Person + primäre E-Mail in einer Transaktion.
-- Schritt (2) nur bei bestätigter E-Mail (email_confirmed_at) -> kein Takeover.
create or replace function claim_or_create_person() returns uuid
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid      uuid   := auth.uid();
  v_email    citext := auth.email();
  v_verified boolean;
  v_pid      uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- (1) bereits verknüpft
  select id into v_pid from person where auth_user_id = v_uid;
  if found then
    return v_pid;
  end if;

  select (email_confirmed_at is not null) into v_verified
    from auth.users where id = v_uid;

  -- (2) migrierte Person via verifizierte E-Mail claimen
  if v_email is not null and coalesce(v_verified, false) then
    select pe.person_id into v_pid
      from person_email pe
      join person p on p.id = pe.person_id
     where pe.email = v_email and p.auth_user_id is null
     limit 1;
    if found then
      update person set auth_user_id = v_uid where id = v_pid;
      update person_email set verified = true
        where person_id = v_pid and email = v_email;
      return v_pid;
    end if;
  end if;

  -- (3) neue Person + primäre E-Mail
  if v_email is null then
    raise exception 'authenticated user has no email' using errcode = '23502';
  end if;
  insert into person (auth_user_id, source_first) values (v_uid, 'portal')
    returning id into v_pid;
  insert into person_email (person_id, email, is_primary, verified)
    values (v_pid, v_email, true, coalesce(v_verified, false));
  return v_pid;
end $$;

-- Primäre E-Mail atomar umsetzen (hält die Invariante ein).
create or replace function set_primary_email(p_email_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare v_pid uuid := current_person_id();
begin
  if v_pid is null then
    raise exception 'no person for current user' using errcode = '28000';
  end if;
  if not exists (select 1 from person_email where id = p_email_id and person_id = v_pid) then
    raise exception 'email % not found for current person', p_email_id;
  end if;
  update person_email set is_primary = (id = p_email_id) where person_id = v_pid;
end $$;

-- === RLS aktivieren (default deny auf allen Tabellen) ======================
alter table person                     enable row level security;
alter table person_email               enable row level security;
alter table person_interest            enable row level security;
alter table person_acquisition_channel enable row level security;
alter table registration               enable row level security;
alter table event                      enable row level security;
alter table vocab_term                 enable row level security;
alter table organization               enable row level security;
alter table org_membership             enable row level security;
alter table staff_user                 enable row level security;

-- Teilnehmer-Policies (eigene Daten). Staff/Migration nutzen service_role (Bypass).
create policy person_self_sel on person for select to authenticated
  using (auth_user_id = auth.uid());
create policy person_self_upd on person for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy pe_self_sel on person_email for select to authenticated
  using (person_id = current_person_id());

create policy pi_self_sel on person_interest for select to authenticated
  using (person_id = current_person_id());
create policy pi_self_ins on person_interest for insert to authenticated
  with check (person_id = current_person_id());
create policy pi_self_del on person_interest for delete to authenticated
  using (person_id = current_person_id());

create policy pac_self_sel on person_acquisition_channel for select to authenticated
  using (person_id = current_person_id());
create policy pac_self_ins on person_acquisition_channel for insert to authenticated
  with check (person_id = current_person_id());
create policy pac_self_del on person_acquisition_channel for delete to authenticated
  using (person_id = current_person_id());

create policy reg_self_sel on registration for select to authenticated
  using (person_id = current_person_id());

create policy vocab_read_all on vocab_term for select to anon, authenticated
  using (true);

create policy event_read_auth on event for select to authenticated
  using (true);
-- organization / org_membership / staff_user: keine Policies -> nur service_role.

-- === GRANTs (auto_expose_new_tables ist aus -> explizit nötig) =============
grant usage on schema public to anon, authenticated, service_role;

-- service_role: voller Zugriff (bypasses RLS) auf aktuelle Tabellen/Views/Funktionen
grant all     on all tables    in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Öffentlich lesbar (Formulare rendern):
grant select on vocab_term to anon, authenticated;
grant select on event      to authenticated;

-- person: lesen + NUR Whitelist-Spalten schreiben (schützt score/flags/auth_user_id/...)
grant select on person to authenticated;
revoke update on person from authenticated;
grant update (
  first_name, last_name, birthdate, occupation_status, work_experience,
  career_level, employer_type, employer_name, study_field, study_program,
  university, self_assessment, linkedin_url, phone, gender, nationality,
  country, preferred_language, startup_phase, cv_url
) on person to authenticated;

-- Kind-Tabellen: lesen; Interessen/Kanäle selbst pflegen; E-Mails/Registrierungen nur lesen
grant select                 on person_email               to authenticated;
grant select, insert, delete on person_interest            to authenticated;
grant select, insert, delete on person_acquisition_channel to authenticated;
grant select                 on registration               to authenticated;

-- Funktions-Ausführung
grant execute on function current_person_id()          to anon, authenticated;
grant execute on function is_staff()                   to authenticated;
grant execute on function claim_or_create_person()     to authenticated;
grant execute on function set_primary_email(uuid)      to authenticated;
