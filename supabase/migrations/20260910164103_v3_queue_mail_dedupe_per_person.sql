-- 0042 · queue_mail dedupliziert je Empfänger: bisher galt „gleiche Vorlage + gleiches Bezugsobjekt, noch in der Warteschlange" ⇒ nur der erste
-- Empfänger eines Fan-outs bekam die Mail (notify_speaker_leads an mehrere Leads, Eingangsbestätigung an Einreichenden + Hauptkontakt).
-- Jetzt zählt zusätzlich die Person; der Schutz „dieselbe Mail nicht doppelt an dieselbe Person, solange sie noch nicht raus ist" bleibt.
set search_path = public, extensions;

create or replace function queue_mail(p_template_key text, p_person_id uuid, p_vars jsonb default '{}'::jsonb, p_related_type text default null, p_related_id uuid default null)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare
  v_email text; v_locale text; v_first text; v_vars jsonb; v_id bigint;
begin
  select pe.email::text,
         coalesce(case when p.preferred_language in ('de', 'en') then p.preferred_language end,
                  case when exists (select 1 from speaker_profile sp where sp.person_id = p.id or sp.assistant_person_id = p.id) then 'en' else 'de' end),
         coalesce(p.first_name, '')
    into v_email, v_locale, v_first
  from person p join person_email pe on pe.person_id = p.id and pe.is_primary
  where p.id = p_person_id and p.deleted_at is null;
  if v_email is null then return null; end if;
  if p_related_id is not null and exists (
       select 1 from mail_log
       where template_key = p_template_key and related_id = p_related_id and person_id = p_person_id and status = 'queued') then
    return null;
  end if;
  v_vars := coalesce(p_vars, '{}'::jsonb) || jsonb_build_object('first_name', v_first);
  if is_suppressed(v_email) then
    insert into mail_log (to_email, person_id, template_key, locale, provider, status, meta, related_type, related_id)
    values ('suppressed:' || email_hash(v_email), p_person_id, p_template_key, v_locale, 'resend', 'suppressed',
            jsonb_build_object('vars', v_vars), p_related_type, p_related_id)
    returning id into v_id;
    return v_id;
  end if;
  insert into mail_log (to_email, person_id, template_key, locale, provider, status, meta, related_type, related_id)
  values (v_email, p_person_id, p_template_key, v_locale, 'resend', 'queued',
          jsonb_build_object('vars', v_vars), p_related_type, p_related_id)
  returning id into v_id;
  return v_id;
end $$;

-- Trigger-Funktionen sind nicht direkt aufrufbar; der Vollständigkeit halber ohne EXECUTE für API-Rollen.
revoke execute on function trg_org_product_sync() from public, anon, authenticated;
revoke execute on function trg_org_edition_sync() from public, anon, authenticated;

select harden_definer_functions();
