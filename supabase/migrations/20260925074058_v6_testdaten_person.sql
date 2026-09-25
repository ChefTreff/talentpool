-- 0183 · testdaten_person: Testperson mit primärer Adresse in einer Transaktion (nur service_role, nur +zztest)
-- Angewendet von der Architektur-Session am 25.09.2026 als 20260925074058.
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: Die Pipeline (LEAD-028) zeigt nur Speaker **vor** der Zusage. Auf der
-- Edition stehen aber nur bestätigte Profile — Konrad könnte die Seite nicht
-- abnehmen (Regel vom 25.09.). Das Testdaten-Skript soll dafür drei
-- TEST-Personen anlegen. Das scheitert am Constraint-Trigger
-- `trg_person_primary_email` (deferred): eine Person braucht beim Commit genau
-- eine primäre E-Mail, und über PostgREST sind Person und E-Mail zwei
-- Transaktionen. `upsert_speaker` legt beides zusammen an, verlangt aber eine
-- angemeldete Person — der Service-Client hat keine.
--
-- `testdaten_person(vorname, nachname, email)`:
--   * **nur der Server** — mit angemeldetem Konto 42501; EXECUTE nur für
--     `service_role` (von public, anon, authenticated entzogen);
--   * **nur Testdaten** — Vorname `TEST` und eine Adresse mit `+zztest` im
--     lokalen Teil (ein eigenes Postfach, keine erfundene fremde Adresse);
--     sonst 22023 `not_test_data`;
--   * legt Person und primäre E-Mail in **einer** Transaktion an; gibt es die
--     Adresse schon, kommt die vorhandene Person zurück (idempotent).
--
-- Keine bestehende Funktion geändert. Fehlerschlüssel: 22023 `not_test_data`.

set search_path = public, extensions;

create or replace function testdaten_person(p_first_name text, p_last_name text, p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid; v_email citext := nullif(btrim(p_email), '')::citext;
begin
  -- Nur das Testdaten-Skript (service_role, ohne Konto) — nie aus dem Portal.
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(p_first_name, '') <> 'TEST' or v_email is null
     or split_part(v_email::text, '@', 1) not like '%+zztest%' then
    raise exception 'not_test_data' using errcode = '22023';
  end if;
  select pe.person_id into v_pid from person_email pe where pe.email = v_email;
  if found then return v_pid; end if;
  insert into person (first_name, last_name, source_first)
  values ('TEST', nullif(btrim(p_last_name), ''), 'testdaten')
  returning id into v_pid;
  insert into person_email (person_id, email, is_primary, verified) values (v_pid, v_email, true, false);
  return v_pid;
end $$;

revoke execute on function testdaten_person(text, text, text) from public, anon, authenticated;

select harden_definer_functions();
