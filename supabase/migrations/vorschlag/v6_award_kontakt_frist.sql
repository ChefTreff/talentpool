-- Löschfrist der Award-Ansprechperson: 14 Monate nach dem Summit (K-51, ADM-024)
--
-- Konrad (02.10.): „14 Monate nach dem Summit" — die Daten sind beim nächsten
-- Summit noch nutzbar, danach fallen Vor-, Nachname und E-Mail der
-- Ansprechperson. Die Bewerbung selbst (Initiative, Texte, Bilder) und die
-- Stimmen bleiben; sie tragen keinen Personenbezug.
--
-- Umsetzung:
--   * `award_application.contact_purged_at`; die drei Kontaktfelder dürfen
--     danach leer sein — vorher nicht (Prüfregel).
--   * `award_purge_contacts()`: leert alle Bewerbungen von Editionen, deren
--     `end_date` mehr als 14 Monate zurückliegt. Läuft täglich über den
--     Cron-Weg (`/api/cron/award-kontakte`, Service-Rolle, ohne Sitzung) und
--     ist im Admin mit dem Abschnitt `initiatives` aufrufbar. Audit mit Anzahl
--     und Edition — ohne Namen oder Adressen.
--   * Idempotent: schon geleerte Bewerbungen fasst der Lauf nicht mehr an.
set search_path = public, extensions;

alter table award_application
  add column contact_purged_at timestamptz,
  alter column contact_first_name drop not null,
  alter column contact_last_name drop not null,
  alter column contact_email drop not null;
alter table award_application add constraint award_application_contact_chk
  check (contact_purged_at is not null
         or (contact_first_name is not null and contact_last_name is not null and contact_email is not null));
comment on column award_application.contact_purged_at is
  'K-51: Vor-, Nachname und E-Mail der Ansprechperson geleert (14 Monate nach dem Summit, award_purge_contacts).';

create or replace function award_purge_contacts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer := 0; v_ed record; v_m integer;
begin
  -- Ohne Sitzung (Cron mit Service-Rolle) oder mit dem Abschnitt `initiatives`.
  if auth.uid() is not null and not has_admin_section('initiatives') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  for v_ed in
    select e.id from event e
     where e.end_date is not null and e.end_date + interval '14 months' < current_date
       and exists (select 1 from award_application a where a.edition_id = e.id and a.contact_purged_at is null)
  loop
    update award_application
       set contact_first_name = null, contact_last_name = null, contact_email = null, contact_purged_at = now()
     where edition_id = v_ed.id and contact_purged_at is null;
    get diagnostics v_m = row_count;
    v_n := v_n + v_m;
    perform log_audit('award.contacts_purged', 'event', v_ed.id::text, null,
                      jsonb_build_object('applications', v_m, 'rule', '14 months after end_date'));
  end loop;
  return v_n;
end $$;
revoke execute on function award_purge_contacts() from public, anon;
grant execute on function award_purge_contacts() to authenticated, service_role;

select harden_definer_functions();
